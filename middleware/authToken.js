import jwt from "jsonwebtoken"

// token verification
// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  // console.log(token);
  
  if (!token) {
    return res.status(401).json({ message: "ID Token is required" });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("Error verifying token:", err);
        return res.status(401).json({ message: "Unauthorized" });
      }
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("Error verifying ID token:", error);
    res.status(401).json({ message: "Invalid ID token", error });
  }
};

export default verifyToken