// scripts/migrate-to-express.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Setup paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const appDir = path.join(rootDir, 'app');

async function main() {
  console.log('Starting migration to Express...');

  // 1. Install required dependencies
  console.log('Installing Express dependencies...');
  try {
    execSync('pnpm add @remix-run/express @remix-run/node express-session cookie-parser compression', {
      stdio: 'inherit',
    });
    console.log('Dependencies installed successfully.');
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    process.exit(1);
  }

  // 2. Update tsconfig to remove Cloudflare references
  console.log('Updating TypeScript configuration...');
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  try {
    const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
    
    // Update types to remove Cloudflare and add Express
    if (tsconfig.compilerOptions && tsconfig.compilerOptions.types) {
      tsconfig.compilerOptions.types = tsconfig.compilerOptions.types.filter(
        type => !type.includes('@cloudflare')
      );
      
      // Add Express types if not already there
      const expressTypes = ['@types/express', '@types/express-session'];
      for (const type of expressTypes) {
        if (!tsconfig.compilerOptions.types.includes(type)) {
          tsconfig.compilerOptions.types.push(type);
        }
      }
    }
    
    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    console.log('TypeScript configuration updated.');
  } catch (error) {
    console.error('Failed to update tsconfig.json:', error);
  }

  // 3. Create necessary utility files if they don't exist
  console.log('Creating Express compatibility utilities...');
  
  const files = [
    {
      path: path.join(appDir, 'utils', 'express-context-adapter.server.ts'),
      content: `// app/utils/express-context-adapter.server.ts
import type { Request, Response } from 'express';

/**
 * Creates a context object compatible with the existing codebase
 * that was originally designed for Cloudflare Pages.
 * 
 * This adapter allows for a smoother transition by maintaining
 * the expected structure while actually using Express.
 */
export function createExpressContext(req: Request, res: Response) {
  return {
    // Main context object
    env: process.env,
    req,
    res,
    
    // Legacy structure for cloudflare context
    cloudflare: {
      env: process.env
    }
  };
}

/**
 * Helper function to get environment variables consistently
 * Works with both the legacy Cloudflare context and the Express context
 */
export function getEnvVar(context: any, key: string): string | undefined {
  // Try context.env first (new Express pattern)
  if (context?.env && context.env[key] !== undefined) {
    return context.env[key];
  }
  
  // Try context.cloudflare.env (legacy Cloudflare pattern)
  if (context?.cloudflare?.env && context.cloudflare.env[key] !== undefined) {
    return context.cloudflare.env[key];
  }
  
  // Fall back to process.env
  return process.env[key];
}

/**
 * Type definition for the Express app context
 * This helps provide type safety while transitioning
 */
export interface ExpressAppContext {
  env: Record<string, string | undefined>;
  req: Request;
  res: Response;
  cloudflare?: {
    env: Record<string, string | undefined>;
  };
}

/**
 * Helper to get API keys consistently from the context
 */
export function getApiKey(context: any, key: string): string | undefined {
  return getEnvVar(context, key);
}

/**
 * Helper to check if an environment variable is set
 */
export function hasEnvVar(context: any, key: string): boolean {
  return !!getEnvVar(context, key);
}`
    },
    {
      path: path.join(appDir, 'utils', 'api-utils.server.ts'),
      content: `// app/utils/api-utils.server.ts
import type { Request, Response } from 'express';
import { json } from '@remix-run/node';
import type { ExpressAppContext } from './express-context-adapter.server';

/**
 * Helper for handling API errors consistently across Express routes
 */
export function handleApiError(error: unknown, status = 500) {
  console.error('API Error:', error);
  
  if (error instanceof Error) {
    if (error.message?.includes('API key')) {
      return json(
        { error: 'Invalid or missing API key' },
        { status: 401, statusText: 'Unauthorized' }
      );
    }
    
    return json(
      { error: error.message },
      { status, statusText: getStatusText(status) }
    );
  }
  
  return json(
    { error: 'An unknown error occurred' },
    { status, statusText: getStatusText(status) }
  );
}

/**
 * Gets cookies from a request in a consistent manner
 */
export function getCookiesFromRequest(request: Request): Record<string, string> {
  // If using express-style request with cookies already parsed
  if (request.cookies && typeof request.cookies === 'object') {
    return request.cookies;
  }
  
  // Otherwise parse from cookie header (Remix/Cloudflare style)
  const cookieHeader = request.headers.get?.('Cookie') || request.headers?.['cookie'];
  
  if (!cookieHeader) {
    return {};
  }
  
  // Parse cookies from header
  return parseCookies(typeof cookieHeader === 'string' ? cookieHeader : '');
}

/**
 * Parses cookies from a cookie header string
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

/**
 * Returns an appropriate status text for common HTTP status codes
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error'
  };
  
  return statusTexts[status] || 'Unknown Status';
}

/**
 * Creates a standardized function for Express API route handling
 */
export function createApiHandler(
  handler: (context: ExpressAppContext, request: Request, response: Response) => Promise<Response>
) {
  return async function apiHandler(args: { context: ExpressAppContext, request: Request, params: any }) {
    try {
      const { context, request } = args;
      const response = context.res || new Response();
      
      return await handler(context, request, response);
    } catch (error) {
      return handleApiError(error);
    }
  };
}`
    },
    {
      path: path.join(appDir, 'types', 'express.d.ts'),
      content: `// app/types/express.d.ts
import type { Request, Response } from 'express';
import type { Session } from 'express-session';

// Express session augmentation
declare module 'express-session' {
  interface SessionData {
    access_token?: string;
    user_id?: string;
  }
}

// Define the load context for the Express adapter
declare module '@remix-run/express' {
  interface AppLoadContext {
    env: Record<string, string | undefined>;
    req: Request;
    res: Response;
    cloudflare?: {
      env: Record<string, string | undefined>;
    };
  }
}

// For backward compatibility with Cloudflare-based code
declare module '@remix-run/node' {
  interface AppLoadContext {
    env: Record<string, string | undefined>;
    req: Request;
    res: Response;
    cloudflare?: {
      env: Record<string, string | undefined>;
    };
  }
}`
    }
  ];
  
  for (const file of files) {
    try {
      await fs.mkdir(path.dirname(file.path), { recursive: true });
      
      // Only write if file doesn't exist
      try {
        await fs.access(file.path);
        console.log(`File already exists: ${file.path}`);
      } catch {
        await fs.writeFile(file.path, file.content);
        console.log(`Created: ${file.path}`);
      }
    } catch (error) {
      console.error(`Failed to create ${file.path}:`, error);
    }
  }

  // 4. Look for files with cloudflare imports and suggest changes
  console.log('\nScanning for Cloudflare references...');
  const routesDir = path.join(appDir, 'routes');
  const files = await findFilesWithPattern(routesDir, '@remix-run/cloudflare');
  
  if (files.length > 0) {
    console.log('\nFound Cloudflare references in these files:');
    files.forEach(file => console.log(`- ${path.relative(rootDir, file)}`));
    
    console.log(`\nPlease update these files to use '@remix-run/node' or '@remix-run/express' imports.`);
    console.log('Example change:');
    console.log('  FROM: import { json } from "@remix-run/cloudflare";');
    console.log('  TO:   import { json } from "@remix-run/node";');
  } else {
    console.log('No Cloudflare references found in routes directory.');
  }

  console.log('\nMigration assistance complete!');
  console.log('Next steps:');
  console.log('1. Update server.js to use Express (if not already done)');
  console.log('2. Update API routes to use the new context pattern');
  console.log('3. Test the application in development mode');
  console.log('4. Run a production build and test');
}

async function findFilesWithPattern(directory, pattern) {
  const results = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    
    if (entry.isDirectory()) {
      const subResults = await findFilesWithPattern(fullPath, pattern);
      results.push(...subResults);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = await fs.readFile(fullPath, 'utf8');
      if (content.includes(pattern)) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

main().catch(error => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
