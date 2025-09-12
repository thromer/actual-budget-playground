import { mkdir, readFile } from 'fs/promises';
import * as api from '@actual-app/api';

interface Credentials {
  actual: {
    server_password: string;
    encryption_password: string;
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

async function main() {
  let creds;
  try {
    creds = await readJsonFile<Credentials>('credentials.json');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const dataDir = process.env['HOME'] + '/.config/actual-budget';
  await mkdir(dataDir, { recursive: true });    
  await api.init({
    dataDir: dataDir,
    serverURL: 'https://laughing-crayfish.pikapod.net/',
    password: creds.actual.server_password
  });

  // This is the ID from Settings → Show advanced settings → Sync ID
  const pikapod_sync_id = '3a295f4a-9dae-486e-8a96-f9ec173ca7ae';
  await api.downloadBudget(pikapod_sync_id, {
    password: creds.actual.encryption_password
  });

  const budget = await api.getBudgetMonth('2025-09');
  console.log(budget);
  await api.shutdown();
}

main();
