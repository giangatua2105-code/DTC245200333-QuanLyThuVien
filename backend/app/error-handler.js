module.exports = (err, req, res, next) => {
  let status = err.status || 500,
    message = err.message;
  if (err.code === "23505") {
    status = 409;
    message = "Dữ liệu đã tồn tại hoặc bạn đang mượn sách này";
  }
  if (err.code === "23503") {
    status = 409;
    message =
      "Dữ liệu đang được sử dụng trong sách/phiếu mượn, không thể xóa; hoặc mã liên kết không tồn tại";
  }
  if (err.code === "23514" || err.code === "22008") {
    status = 400;
    message = "Ngày hoặc số lượng không hợp lệ";
  }
  if (status >= 500) {
    console.error("request_error", req.requestId, err.code || err.name);
    message = "Lỗi hệ thống, vui lòng thử lại";
  }
  res.status(status).json({ message, requestId: req.requestId });
};
