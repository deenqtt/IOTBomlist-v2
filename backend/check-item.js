import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const item = await prisma.item.findFirst({
        where: {
            OR: [
                { stableId: 'C5199242' },
                { partNumber: 'C5199242' },
                { supplierPrices: { contains: 'C5199242' } }
            ]
        }
    });
    console.log(JSON.stringify(item, null, 2));
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
