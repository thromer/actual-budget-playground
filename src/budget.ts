import { FileHandle, mkdir, readFile } from 'fs/promises';
import *  as actual from '@actual-app/api';
import { Command } from 'commander';
import { z } from 'zod';

const deleteOptionsSchema = z.object({
  budgets: z.array(z.string()),
})
type DeleteOptions = z.infer<typeof deleteOptionsSchema>;

const program = new Command();
program
  .version('1.0.0')
  .description('budget')

program
  .command('list')
  .description('list budgets')
  .action(async () => {
    await listBudgets();
  });

program
  .command('delete')
  .description('delete budgets')
  .requiredOption('-b, --budgets [<str>]', 'Budget ids')
  .action(async (options) => {
    const result = deleteOptionsSchema.safeParse(options);
    if (!result.success) {
      result.error.issues.forEach(err => {
        console.error(`${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    await deleteBudgets(result.data);
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
async function readJsonFile<T>(infile: string | FileHandle): Promise<T> {
  try {
    const fileContent = await readFile(infile, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read JSON file: ${error.message}`);
    }
    throw error;
  }
}

async function withActual(body: () => Promise<void>): Promise<void> {
  const configDir = process.env['HOME'] + '/.config/actual';
  let creds;
  try {
    creds = await readJsonFile(configDir + '/credentials.json') as Credentials;
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
  await actual.init(config);
  await body()
  await actual.shutdown();
}

async function listBudgets(): Promise<void> {
  await withActual(async () => {
    const budgets = await actual.getBudgets();
    console.log(JSON.stringify(budgets, null, 2));
  });
}

async function deleteBudgets(options: DeleteOptions): Promise<void> {
  await withActual(async () => {
    console.log(JSON.stringify(options));
  });
}
