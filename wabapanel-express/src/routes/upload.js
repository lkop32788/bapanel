const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadFile, uploadMultiple, deleteFile } = require('../controllers/uploadController');

const storage = multer.memoryStorage();

// SEC-LOCK：全平台上传锁定，仅允许 txt（原图片/视频/音频/文档白名单见 git 历史，
// 放开时从 85b8471 之前的版本恢复）
const { txtOnlyFilter } = require('../middleware/txtOnlyUpload');
const fileFilter = txtOnlyFilter;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // large source ok; media is compressed/transcoded to platform limits
});

// Map multer errors (fileFilter / limits) to 400 instead of the generic 500 handler.
const handleUpload = (mw) => (req, res, next) => {
  mw(req, res, (err) => {
    if (!err) return next();
    // Any error from the upload middleware (multer limits, fileFilter, busboy malformed multipart) is a client-input problem.
    return res.status(400).json({ success: false, message: err.message });
  });
};

router.use(protect);
router.post('/', handleUpload(upload.single('file')), uploadFile);
router.post('/multiple', handleUpload(upload.array('files', 10)), uploadMultiple);
router.delete('/', deleteFile);

module.exports = router;
