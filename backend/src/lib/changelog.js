import prisma from './prisma';
export async function logChange({ entity, entityId, field, oldValue, newValue, changedBy, context }) {
    try {
        await prisma.changeLog.create({
            data: {
                entity,
                entityId: String(entityId),
                field,
                oldValue: oldValue === null ? null : String(oldValue),
                newValue: newValue === null ? null : String(newValue),
                changedBy,
                context
            }
        });
    }
    catch (err) {
        console.error('[CHANGELOG ERROR] Failed to create log:', err);
    }
}
