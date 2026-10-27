#!/usr/bin/env node
import { main } from '../skills/opensource/scripts/cli.mjs';

main().catch((error) => {
  console.error(`OpenSource: ${error.message}`);
  process.exitCode = 1;
});
