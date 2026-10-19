const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const c = require("../controllers/mediaController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../../uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
// SEC-LOCK：全平台上传锁定，仅允许 txt
const { txtOnlyFilter } = require('../middleware/txtOnlyUpload');
const fileFilter = txtOnlyFilter;
const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } }); // large source ok; videos are transcoded down to WhatsApp's 16MB limit

// Map multer errors (fileFilter / limits) to 400 instead of the generic 500 handler.
const handleUpload = (mw) => (req, res, next) => {
  mw(req, res, (err) => {
    if (!err) return next();
    // Any error from the upload middleware (multer limits, fileFilter, busboy malformed multipart) is a client-input problem.
    return res.status(400).json({ success: false, message: err.message });
  });
};

router.use(protect, workspaceAccess);
router.get("/", c.getAll);
router.post("/upload", handleUpload(upload.single("file")), c.upload);
router.put("/:id", c.update);
router.delete("/:id", c.remove);
module.exports = router;
