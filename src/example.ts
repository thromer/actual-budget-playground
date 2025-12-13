// TODO make this and others subcommands of general purpose command
// TODO would be nice not to have manually update sync id when it changes.

// For example:
// yarn example 'Mechanics Bank' 3

import { mkdir, readFile } from 'fs/promises';
import *  as api from '@actual-app/api';
import { Command } from 'commander';
import { z } from 'zod';

function createRegexTransform() {
  return (val: string, ctx: z.RefinementCtx): RegExp => {
    console.log(`val=${val}`);
    const firstSlash = val.indexOf('/');
    const lastSlash = val.lastIndexOf('/');
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
  };
}

const optionsSchema = z.object({
  budget: z.string(),
  account: z.string(),
  start: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  end: z.iso.date('Must be valid ISO YYYY-MM-DD date'),
  includeNotes: z.string().transform(createRegexTransform()).optional(),
  excludeNotes: z.string().transform(createRegexTransform()).optional(),
  full: z.boolean(),
}).refine((options) => options.start <= options.end, {message: 'start must be less than or equal to end', path: ['start,end']});

type Options = z.infer<typeof optionsSchema>;

const program = new Command();
program
  .name('adjustnotes')
  .description('Prepend string to notes field for subset of transactions')
  .version('1.0.0')
  .requiredOption('-b, --budget <str>', 'Budget name')
  .requiredOption('-a, --account <str>', 'Account name or id')
  .requiredOption('-s, --start <date>', 'Start date, YYYY-MM-DD')
  .requiredOption('-e, --end <date>', 'End date, YYYY-MM-DD', '9999-12-31')
  .option('-i, --include-notes /<pattern>/<optional options>', `Notes regex to include e.g. /\\b(#review|#reviewed)\\b/i`)
  .option('-x, --exclude-notes /<pattern>/<optional options>', `Notes regex to exclude e.g. /\\b(#review|#reviewed)\\b/i`)
  .option('-f, --full', 'Dump full record', false)
  .action(async (options) => {
    const result = optionsSchema.safeParse(options);
    if (!result.success) {
      result.error.issues.forEach(err => {
        console.error(`${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    console.log(`options.include=${options.includeNotes}`);
    console.log(`options.exclude=${options.excludeNotes}`);
    await main(result.data);
  });

program.parse(process.argv);

interface ActualCredentials {
  host: string;
  server_password: string;
  encryption_password: string;
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

async function getSyncId(budgetName: string): Promise<string> {
  const budgets = await api.getBudgets();
  const syncIds = new Set(budgets.filter(b => b.name === budgetName).map(b => b.groupId));
  if (syncIds.size == 0) {
    throw new Error(`Budget '${budgetName}' not found`);
  }
  if (syncIds.size > 1) {
    throw new Error(`Multiple budgets named '${budgetName}' `);
  }
  return Array.from(syncIds)[0] as string;
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

  await api.downloadBudget(await getSyncId(options.budget));
  const account = options.account;
  const accounts = await api.getAccounts();
  const by_id = new Map(accounts.map(a => [a.id, a]));
  let acct_id = by_id.get(account)?.id;
  if (!acct_id) {
    const by_name = new Map(accounts.map(a => [a.name, a]));
    acct_id = by_name.get(account)?.id;
    if (!acct_id) {
      console.log(`${account} not found, try one of ${[...by_name.keys()]}`)
      process.exit(1);
    }
  }
  const transactions = await api.getTransactions(acct_id, options.start, options.end);
  for (const t of transactions) {
    const t_notes = t.notes ?? "";
    if (options.includeNotes && !t_notes.match(options.includeNotes)) {
      console.log(`${t.notes} not included`);
      continue;
    }
    if (options.excludeNotes && t_notes.match(options.excludeNotes)) {
      console.log(`Excluding ${t.notes}`);
      continue;
    }
    if (options.full) {
      console.log(t);
    } else {
      console.log(t.date, t.amount, t.notes);
    }
  }
  await api.shutdown();
}
