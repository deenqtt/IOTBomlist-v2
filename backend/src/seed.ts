import 'dotenv/config'
import prisma from './lib/prisma.js'
import { hashPassword } from './lib/auth.js'

async function main() {
  const users = [
    { username: 'jonathan', password: 'admins', role: 'super' },
    { username: 'alfi',     password: 'admin123', role: 'admin' },
    { username: 'rendra',   password: 'admin123', role: 'admin' },
    { username: 'alfon',    password: 'admin123', role: 'admin' },
    { username: 'rifai',    password: 'admin123', role: 'admin' },
    { username: 'vincent',  password: 'admin123', role: 'admin' },
    { username: 'deden',    password: 'user123', role: 'user' },
    { username: 'syahrul',  password: 'user123', role: 'user' },
    { username: 'ikhsal',   password: 'user123', role: 'user' },
  ]

  for (const u of users) {
    const hash = await hashPassword(u.password)
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, passwordHash: hash, role: u.role },
    })
    console.log(`✓ ${u.username} (${u.role})`)
  }

  console.log('Seed complete.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
