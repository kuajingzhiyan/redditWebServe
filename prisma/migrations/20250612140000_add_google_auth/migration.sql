-- AlterTable
ALTER TABLE `User` MODIFY `password` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `googleId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_googleId_key` ON `User`(`googleId`);
