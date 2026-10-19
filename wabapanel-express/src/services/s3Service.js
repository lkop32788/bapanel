const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class S3Service {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.AWS_S3_BUCKET;
    this.region = config.region || process.env.AWS_REGION || 'ap-south-1';
    this.client = null;
  }

  _getClient(config = {}) {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: config.region || this.region,
      credentials: {
        accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    return this.client;
  }

  resetClient() {
    this.client = null;
  }

  initFromSettings(settings) {
    const s3Config = settings?.aws || settings?.s3 || {};
    this.bucket = s3Config.bucket || this.bucket;
    this.region = s3Config.region || this.region;
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: s3Config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    return this;
  }

  async upload(file, folder = 'uploads') {
    folder = this._safeFolder(folder); // SEC-UP1
    // Use local storage if S3 not configured
    if (!this.bucket || !process.env.AWS_ACCESS_KEY_ID) {
      return this._uploadLocal(file, folder);
    }
    const client = this._getClient();
    const ext = this._safeExt(file.originalname);
    const key = `${folder}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await client.send(command);

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { key, url, bucket: this.bucket };
  }

  // SEC-UP1：folder 来自请求方（req.body.folder），必须消毒——只允许字母数字_-，
  // 防止 ../ 路径穿越以 root 身份写任意目录；ext 同样只收常规形态
  _safeFolder(folder) {
    const clean = String(folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return clean || 'uploads';
  }

  _safeExt(name) {
    const ext = path.extname(String(name || ''));
    return /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext.toLowerCase() : '';
  }

  _uploadLocal(file, folder = 'uploads') {
    folder = this._safeFolder(folder);
    const uploadsRoot = path.resolve(__dirname, '../../uploads');
    const uploadDir = path.resolve(uploadsRoot, folder);
    if (!uploadDir.startsWith(uploadsRoot + path.sep)) {
      throw new Error('非法的上传目录');
    }
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const ext = this._safeExt(file.originalname);
    const filename = uuidv4() + ext;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    const url = `/uploads/${folder}/${filename}`;
    return { key: `${folder}/${filename}`, url, bucket: 'local' };
  }

  async uploadBuffer(buffer, filename, mimetype, folder = 'uploads') {
    folder = this._safeFolder(folder); // SEC-UP1
    const client = this._getClient();
    const ext = this._safeExt(filename);
    const key = `${folder}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    });

    await client.send(command);

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { key, url, bucket: this.bucket };
  }

  async delete(key) {
    const client = this._getClient();
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return client.send(command);
  }

  async getSignedDownloadUrl(key, expiresIn = 3600) {
    const client = this._getClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn });
  }
}

module.exports = new S3Service();
