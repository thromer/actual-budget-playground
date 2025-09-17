// TODO would be nice not to have manually update sync id when it changes.

// For example:
// yarn dev 'Cash test' 3
import { mkdir, readFile } from 'fs/promises';
import * as api from '@actual-app/api';

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
    console.log(`Usage: node dist/index.js <account_id|account_name> <last n days> [add|remove]`);
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
  const test_prefix = "[test] ";
  const tpl = test_prefix.length
  for (const t of transactions) {
    if (command === "full") {
      console.log(t);
    } else {
      console.log(t.date, t.amount, t.notes);
    }
    let new_notes: string | null = null
    if (command == "add" && t.notes === "very fake") {
      new_notes = test_prefix + t.notes;
    } else if (command == "remove") {
      if (t.notes.slice(0, tpl) == test_prefix) {
	new_notes = t.notes.slice(tpl);
      }
    }
    if (new_notes !== null) {
      console.log(`Updating note to ${new_notes}`);
      await api.updateTransaction(t.id, {notes: new_notes});
    }
  }
  await api.shutdown();
}

main();
