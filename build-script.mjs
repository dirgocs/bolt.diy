#!/usr/bin/env node
import pkg from '@remix-run/dev';
const { build } = pkg;

async function runBuild() {
  try {
    process.env.NODE_NO_WARNINGS = '1';
    console.log('🚀 Starting Remix build...');
    await build();
    console.log('✅ Remix build completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Remix build failed:', error);
    process.exit(1);
  }
}

runBuild();
