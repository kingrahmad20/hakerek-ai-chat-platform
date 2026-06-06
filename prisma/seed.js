// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        throw new Error('ADMIN_PASSWORD env var is required');
    }

    const hashed = await bcrypt.hash(password, 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@hakerek.com' },
        update: { password: hashed },
        create: {
            email: 'admin@hakerek.com',
            password: hashed,
            name: 'Admin',
            role: 'ADMIN',
        },
    });
    console.log('Admin user created/updated:', admin.email);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
