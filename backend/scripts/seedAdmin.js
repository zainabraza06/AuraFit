/**
 * seedAdmin.js — One-time admin account seeder
 *
 * Usage:
 *   node scripts/seedAdmin.js
 *
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME from .env
 * If those are not set, falls back to hardcoded defaults (change before running in production).
 *
 * Safe to re-run — will update existing admin if already seeded.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import connectDB from '../config/db.js';
import User from '../models/User.js';

async function seedAdmin() {
  await connectDB();

  const name     = process.env.ADMIN_NAME     || 'Admin';
  const email    = process.env.ADMIN_EMAIL    || 'admin@aurafit.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const existing = await User.findOne({ email });

  if (existing) {
    // Update role to admin in case it was demoted
    existing.role = 'admin';
    await existing.save();
    console.log(`✅ Admin already exists — ensured role=admin for: ${email}`);
  } else {
    await User.create({ name, email, password, role: 'admin' });
    console.log(`✅ Admin account created successfully!`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`\n⚠  Change the password from the Admin Dashboard after first login!`);
  }

  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Seeder failed:', err.message);
  process.exit(1);
});
