// TODO would be nice not to have manually update sync id when it changes.

// For example:
// yarn adjustnotes --start 2023-01-02 --end 2023-01-01 --exclude '\b(#review|#reviewed)\b' --prepend 192 -n

import { /*mkdir,*/ readFile } from 'fs/promises';
// import *  as api from '@actual-app/api';
// import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { Command, Option, runExit } from 'clipanion';
import * as t from 'typanion';

// Custom validator for YYYY-MM-DD format
const isDateFormat = t.cascade(
  t.isString(),
  t.matchesRegExp(/^\d{4}-\d{2}-\d{2}$/)
);

// Custom validator for regex pattern (ensures it's a valid regex)
const isRegexPattern = t.cascade(
  t.isString(),
  (value: string, state?: t.ValidationState): boolean => {
    try {
      new RegExp(value);
      return true;
    } catch (e) {
      if (state?.errors) {
        state.errors.push(`Invalid regex pattern: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
      return false;
    }
  }
);

class MyCommand extends Command {
  start = Option.String('--start', {
    required: true,
    validator: isDateFormat,
    description: 'Start date in YYYY-MM-DD format',
  });

  end = Option.String('--end', {
    required: true,
    validator: isDateFormat,
    description: 'End date in YYYY-MM-DD format',
  });

  excludePattern = Option.String('--exclude', {
    required: true,
    validator: isRegexPattern,
    description: 'Regex pattern to exclude',
  });

  get exclude(): RegExp {
    return new RegExp(this.excludePattern);
  }

  prepend = Option.String('--prepend', {
    required: false,
    description: 'String to prepend',
  });

  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Dry run mode',
  });

  async execute() {
    console.log('Parsed arguments:');
    console.log('Start:', this.start);
    console.log('End:', this.end);
    console.log('Exclude:', this.exclude);
    console.log('Prepend:', this.prepend);
    console.log('Dry run:', this.dryRun);

    // Your actual command logic here
  }
}

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

/*
function isValidInteger(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && isFinite(num) && value.trim() !== '';
  }
 */

/*
--n dry run
--start YYYY-MM-DD
--end YYYY-MM-DD
--prepend <string>
--exclude <regex>
*/
async function main() {
  // Usage example
  // const cli = new MyCommand();
  runExit(MyCommand) // process.argv.slice(2));
  const configDir = process.env['HOME'] + '/.config/actual';
  // let creds;
  try {
    await readJsonFile<Credentials>(configDir + '/credentials.json'); // creds =
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  process.exit(17)
  
    /*
  
  const account = process.argv[2];
  const last_str = process.argv[3];
  const command = process.argv[4] || "";
  if (process.argv.length < 4 || process.argv.length > 5 || account == undefined || last_str === undefined || !isValidInteger(last_str)) {
    console.log(`Usage: node dist/example.js <account_id|account_name> <last n days> [add|remove|full]`);
    process.exit(1);
  }
  if (!new Set(["", "full", "add", "remove"]).has(command)) {
    console.log(`Unknown command: ${command}`);
    process.exit(1);
  }

  const last = parseInt(last_str);
  const dataDir = configDir + '/cache';
  await mkdir(dataDir, { recursive: true });
  const config = {
    dataDir: dataDir,
    serverURL: creds.actual.host,
    password: creds.actual.server_password
  };
  await api.init(config);

  await api.downloadBudget(creds.actual.sync_id);
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
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - last);
  const transactions = await api.getTransactions(acct.id, start, end);
  await api.batchBudgetUpdates(async function() {await updateTransactions(transactions, command);});
  await api.shutdown();
     */
}
/*
async function updateTransactions(transactions: TransactionEntity[], command: string) {
  const test_prefix = "[test] ";
  const tpl = test_prefix.length
  for (const t of transactions) {
    if (command === "full") {
      console.log(t);
    } else {
      console.log(t.date, t.amount, t.notes);
    }
    let new_notes: string | null = null
    const old_notes = t.notes ? t.notes : "";
    if (command == "add") {
      new_notes = test_prefix + t.notes;
    } else if (command == "remove") {
      if (old_notes.slice(0, tpl) == test_prefix) {
	new_notes = old_notes.slice(tpl);
      }
    }
    if (new_notes !== null) {
      console.log(`Updating note to ${new_notes}`);
      await api.updateTransaction(t.id, {notes: new_notes});
    }
  }
}
 */
main();
