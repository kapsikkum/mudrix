// Lets the node tests import modules the way the app does: relative paths without an extension.
import { register } from 'node:module';

register(new URL('./resolve-ts.mjs', import.meta.url));
