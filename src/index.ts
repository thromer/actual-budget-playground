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
  if (process.argv.length != 4 || account == undefined || last_str === undefined || !isValidInteger(last_str)) {
    console.log(`Usage: node dist/index.js <account_id|account_name> <last n days>`);
    process.exit(1);
  }
  const last = parseInt(last_str);

  let creds;
  try {
    creds = await readJsonFile<Credentials>('credentials.json');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const dataDir = process.env['HOME'] + '/.config/actual/cache';
  await mkdir(dataDir, { recursive: true });
  const config = {
    dataDir: dataDir,
    serverURL: `https://${creds.actual.host}/`,
    password: creds.actual.server_password
  };
  await api.init(config);

  await api.downloadBudget(creds.actual.sync_id, {
    password: creds.actual.encryption_password
  });
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
  console.log(transactions);
  await api.shutdown();
}

main();
