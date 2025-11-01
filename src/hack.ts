// TODO make this and prependnotes subcommands of general purpose command
// TODO: would be nice not to have manually update sync id when it changes.
// TODO: would be nice to get all the Command.parse errors not just the first.

// yarn hack --account 'Mechanics Bank' --start 2024-10-02 --end 2024-10-02


import { mkdir, readFile } from 'fs/promises';
import *  as api from '@actual-app/api';
import { Command } from 'commander';
import { z } from 'zod';

const optionsSchema = z.object({
  account: z.string(),
  start: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  end: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
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
  console.log(acct);
  const transactions = await api.getTransactions(acct.id, options.start, options.end);

  if (transactions.length > 1) {
    console.log("Too many matching transactions");
    process.exit(1);
  }
  if (transactions.length == 0) {
    process.exit(1);
  }
  const t = transactions[0];
  if (t.imported_payee != 'Safe Deposit Fee' || t.amount != -3500) {
    console.log('Wrong transaction');
    process.exit(1);
  }
  if (/* t.is_parent || */  t.subtransactions?.length > 0) {    // cheat!
    console.log(`${t.notes} already split`);
    process.exit(1);
  }
  if (t.is_parent) {
    console.log('Setting is_parent false')
    await api.updateTransaction(t.id, {is_parent: false});
  } else {
    const subtransactions = [
      {
	account: t.account,
	date: t.date,
	payee: t.payee,
	amount: -100,
	is_child: true,
	parent_id: t.id,
      },
      {
	account: t.account,
	date: t.date,
	payee: t.payee,
	amount: -3400,
	is_child: true,
	parent_id: t.id,
      }
    ];
    if (options.dryRun) {
      console.log('not splitting');
      process.exit(1);
    }
    console.log('splitting');
    await api.updateTransaction(t.id, {is_parent: true, subtransactions});
  }
  await api.shutdown();
}

