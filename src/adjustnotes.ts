// TODO: would be nice not to have manually update sync id when it changes.
// TODO: would be nice to get all the Command.parse errors not just the first.


import { mkdir, readFile } from 'fs/promises';
import *  as api from '@actual-app/api';
import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { Command } from 'commander';
import { z } from 'zod';

const optionsSchema = z.object({
  account: z.string(),
  start: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  end: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  exclude: z.string().transform((val, ctx) => {
    const firstSlash = val.indexOf('/')
    const lastSlash = val.lastIndexOf('/')
    if (firstSlash != 0 || lastSlash < 0 || firstSlash == lastSlash) {
      ctx.addIssue({
	code: "custom",
	message: 'regex must be of the form /<regex>/<optional flags>',
      });
      return z.NEVER;
    }
    try {
      return new RegExp(val.slice(1, lastSlash), val.slice(lastSlash + 1));
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : 'unknown error',
      });
      return z.NEVER;
    }
  }),
  prepend: z.string(),
  dryRun: z.boolean(),
}).refine((options) => options.start <= options.end, {message: 'start must be less than or equal to end', path: ['start,end']});

type Options = z.infer<typeof optionsSchema>;

const program = new Command();
program
  .name('adjustnotes')
  .description('Prepend string to notes field for subset of transactions')
  .version('1.0.0')
  .requiredOption('-a, --account <str>', 'Account name or id')
  .requiredOption('-s, --start <date>', 'Start date, YYYY-MM-DD')
  .requiredOption('-e, --end <date>', 'End date, YYYY-MM-DD', '9999-12-31')
  .requiredOption('-x, --exclude /<pattern>/<optional options>', `Regex to exclude e.g. /\\b(#review|#reviewed)\\b/i`)
  .requiredOption('-p, --prepend <string>', 'String to prepend')
  .option('-n, --dry-run', 'Dry run mode', false)
  .action((options) => {
    const result = optionsSchema.safeParse(options);
    if (!result.success) {
      result.error.issues.forEach(err => {
        console.error(`${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    main(result.data);
  });

program.parse(process.argv);

interface Credentials {
  actual: {
    host: string;
    server_password: string;
    encryption_password: string;
    sync_id: string;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    return JSON.parse(fileContent) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read JSON file: ${error.message}`);
    }
    throw error;
  }
}

async function main(options: Options) {
  const configDir = process.env['HOME'] + '/.config/actual';
  let creds;
  try {
    creds = await readJsonFile<Credentials>(configDir + '/credentials.json');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const dataDir = configDir + '/cache';
  await mkdir(dataDir, { recursive: true });
  const config = {
    dataDir: dataDir,
    serverURL: creds.actual.host,
    password: creds.actual.server_password
  };
  await api.init(config);

  await api.downloadBudget(creds.actual.sync_id);
  const account = options.account;
  let acct;
  const accounts = await api.getAccounts();
  const by_id = new Map(accounts.map(a => [a.id, a]));
  if (by_id.has(account)) {
    acct = by_id.get(account);
  } else {
    const by_name = new Map(accounts.map(a => [a.name, a]));
    if (!by_name.has(account)) {
      console.log(`${account} not found, try one of ${[...by_name.keys()]}`)
      process.exit(1);
    }
    acct = by_name.get(account);
  }
  const transactions = await api.getTransactions(acct.id, options.start, options.end);
  await api.batchBudgetUpdates(async function() {await updateTransactions(transactions, options);});
  await api.shutdown();
}

async function updateTransactions(transactions: TransactionEntity[], options: Options) {
  for (const t of transactions) {
    const old_notes = t.notes ? t.notes : "";
    if (old_notes.match(options.exclude)) {
      console.log(`Skipping notes "${old_notes}"`)
      continue;
    }
    const new_notes = `${options.prepend} ${old_notes}`;
    const prefix = options.dryRun ? 'Dry run, not updating' : 'Updating';
    console.log(`${prefix} from "${old_notes}" to "${new_notes}"`);
    if (!options.dryRun) {
      await api.updateTransaction(t.id, {notes: new_notes});
    }
  }
}
