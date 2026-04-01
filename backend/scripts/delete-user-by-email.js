const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const email = process.argv[2];
if (!email) {
  console.error('Usage: node delete-user-by-email.js <email>');
  process.exit(1);
}
(async () => {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, username: true } });
  if (!user) {
    console.log(JSON.stringify({ ok: true, message: 'USER_ALREADY_MISSING', email }, null, 2));
    return;
  }
  const id = user.id;
  await prisma.$transaction(async (tx) => {
    await tx.friendship.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
    await tx.matchPlayer.deleteMany({ where: { userId: id } });
    await tx.userGameStats.deleteMany({ where: { userId: id } });
    await tx.userSoloGameProgress.deleteMany({ where: { userId: id } });
    await tx.aIPlayerProfile.deleteMany({ where: { userId: id } });
    await tx.playerSkillProfile.deleteMany({ where: { userId: id } });
    await tx.ghostRun.deleteMany({ where: { playerId: id } });
    await tx.bonusChallengeAward.deleteMany({ where: { userId: id } });
    await tx.contestPlayer.deleteMany({ where: { userId: id } });
    await tx.contestScore.deleteMany({ where: { userId: id } });
    await tx.invite.deleteMany({ where: { createdBy: id } });
    await tx.bannedIP.deleteMany({ where: { bannedUserId: id } });
    await tx.user.delete({ where: { id } });
  });
  const stillThere = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  console.log(JSON.stringify({ ok: true, deletedUser: user, existsAfterDelete: Boolean(stillThere) }, null, 2));
})().finally(async () => prisma.$disconnect());
