// TODO: why does it take multiple attempts to get it to patch everything?

// TODO make this and others subcommands of general purpose command
// TODO: would be nice not to have manually update sync id when it changes.
// TODO: would be nice to get all the Command.parse errors not just the first.

import { mkdir, readFile } from 'fs/promises';
import *  as api from '@actual-app/api';
import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { APIAccountEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import { Command } from 'commander';
import { z } from 'zod';

const optionsSchema = z.object({
  accounts: z.array(z.string()),
  start: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  end: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  tag: z.string(),
  dryRun: z.boolean(),
}).refine((options) => options.start <= options.end, {message: 'start must be less than or equal to end', path: ['start,end']});

type Options = z.infer<typeof optionsSchema>;

const program = new Command();
program
  .name('adjustnotes')
  .description('Prepend string to notes field for subset of transactions')
  .version('1.0.0')
  .requiredOption('-a, --accounts <str...>', 'Account names or ids, e.g. -a one two three, or * for all accounts')
  .requiredOption('-s, --start <date>', 'Start date, YYYY-MM-DD')
  .requiredOption('-e, --end <date>', 'End date, YYYY-MM-DD', '9999-12-31')
  .requiredOption('-t, --tag <str>', "Tag to remove, e.g. -t '#reviewed'")
  .option('-n, --dry-run', 'Dry run mode', false)
  .action(async (options) => {
    const result = optionsSchema.safeParse(options);
    if (!result.success) {
      result.error.issues.forEach(err => {
        console.error(`${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    await main(result.data);
  });

program.parse(process.argv);

interface ActualCredentials {
  host: string;
  server_password: string;
  encryption_password: string;
  sync_id: string;
}

interface Credentials {
  actual: ActualCredentials
}

// TODO: inline me
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
  const accounts = options.accounts;
  let accts: APIAccountEntity[] = [];
  const actualAccounts = await api.getAccounts();
  if (accounts.includes('*')) {
    accts = actualAccounts;
  } else {
    const by_id = new Map(actualAccounts.map(a => [a.id, a]));
    const by_name = new Map(actualAccounts.map(a => [a.name, a]));
    accounts.map(account => {
      let acct = by_id.get(account);
      if (!acct) {
	acct = by_name.get(account);
      }
      if (!acct) {
	console.log(`${account} not found, try one of ${[...by_name.keys()]}`)
	process.exit(1);
      }
      accts.push(acct);
    });
  }
  const transactionss:TransactionEntity[][] = [];
  for (const acct of accts) {
    transactionss.push(await api.getTransactions(acct.id, options.start, options.end));
  }
  await api.batchBudgetUpdates(async function() {
    const regex = new RegExp(`(^| )${options.tag}(?: |$)`);
    for (const transactions of transactionss) {
      await updateTransactions(transactions, regex, options);
    }
  });
  await api.shutdown();
}

function newNotes(old_notes: string, regex: RegExp, dryRun: boolean) {
  const new_notes = old_notes.replace(regex, '$1').trimStart();
  if (old_notes !== new_notes) {
    const prefix = dryRun ? 'Dry run, not updating' : 'Updating';
    console.log(`${prefix} from "${old_notes}" to "${new_notes}"`);
  }
  return new_notes;
}

async function updateTransactions(transactions: TransactionEntity[], regex: RegExp, options: Options) {
  for (const t of transactions) {
    const patch = t;
    const old_notes = t.notes ? t.notes : "";
    const new_notes = newNotes(old_notes, regex, options.dryRun);
    const t_changed = old_notes !== new_notes;
    if (t_changed) {
      patch.notes = new_notes;
    }
    let s_changed = false;
    if (t.subtransactions) {
      for (const s of t.subtransactions) {
	const old_notes = s.notes ? s.notes : "";
	s.notes = newNotes(old_notes, regex, options.dryRun);
	s_changed ||= (old_notes != s.notes);
      }
      if (s_changed) {
	patch.subtransactions = t.subtransactions;
      }
    }
    if (t_changed || s_changed) {
      patch.account = t.account;
      // console.log(`applying patch ${JSON.stringify(patch,null,2)}`);
      if (!options.dryRun) {
	await api.updateTransaction(t.id, patch);
      }
    }
  }
}
