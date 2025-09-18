// TODO would be nice not to have manually update sync id when it changes.

// For example:
// yarn dev 'Cash test' 3

import { mkdir, readFile } from 'fs/promises';
import {batchBudgetUpdates, downloadBudget, getAccounts, getTransactions, shutdown, init, updateTransaction} from '@actual-app/api';
import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';

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

function isValidInteger(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && isFinite(num) && value.trim() !== '';
}

async function main() {
  const account = process.argv[2];
  const last_str = process.argv[3];
  const command = process.argv[4] || "";
  if (process.argv.length < 4 || process.argv.length > 5 || account == undefined || last_str === undefined || !isValidInteger(last_str)) {
    console.log(`Usage: node dist/index.js <account_id|account_name> <last n days> [add|remove|full]`);
    process.exit(1);
  }
  if (!new Set(["", "full", "add", "remove"]).has(command)) {
    console.log(`Unknown command: ${command}`);
    process.exit(1);
  }

  const last = parseInt(last_str);
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
  await init(config);

  await downloadBudget(creds.actual.sync_id);
  let acct;
  const accounts = await getAccounts();
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
  const transactions = await getTransactions(acct.id, start, end);
  await batchBudgetUpdates(async function() {await updateTransactions(transactions, command);});
  await shutdown();
}

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
      await updateTransaction(t.id, {notes: new_notes});
    }
  }
}

main();
