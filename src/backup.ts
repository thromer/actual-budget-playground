import { mkdir, readFile } from 'fs/promises';
import *  as api from '@actual-app/api';
// import { exportBudget } from '@actual-app/api/loot-core/server/budgetfiles/app';
// import { exportBudget } from '@actual-app/api/loot-core/server/budgetfiles/app';

// import { app/*, exportBudget */ } from '@actual-app/api/@types/loot-core/src/server/budgetfiles/app';
// import { exportBudget } from 'loot-core/src/server/budgetfiles/app';
import { exportBudget } from '@actual-app/api/@types/loot-core/src/server/budgetfiles/app';

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

async function main() {
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

  // const response = await const response = await send('export-budget'); // app.method('export-budget', exportBudget)
  // const response = await api.app.handlers['export-budget']();
  const response = await exportBudget();
  console.log(response ? "ok" : "not ok");
}

main()

