import prisma from './prisma.js'

export async function logChange({
  entity,
  entityId,
  field,
  oldValue,
  newValue,
  changedBy,
  context
}: {
  entity: string
  entityId: string | number
  field?: string
  oldValue?: string | null
  newValue?: string | null
  changedBy?: string
  context?: string
}) {
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
    })
  } catch (err) {
    console.error('[CHANGELOG ERROR] Failed to create log:', err)
  }
}
