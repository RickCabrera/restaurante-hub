import { BadRequestException, Controller, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AllowDevice } from '../common/decorators';
import { StorageService } from './storage.service';

const FOLDERS = ['supplies', 'products', 'logos', 'chat', 'categories', 'misc'];

/** Subida de imágenes: multipart/form-data con campo "file". ?folder=products */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @AllowDevice()
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Query('folder') folder = 'misc') {
    if (!FOLDERS.includes(folder)) throw new BadRequestException('Carpeta inválida');
    const maxSize = folder === 'supplies' || folder === 'logos' ? 512 : 1280;
    return this.storage.saveImage(file, { folder, maxSize });
  }
}
