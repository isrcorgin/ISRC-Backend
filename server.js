import express from "express";
import multer from "multer";
import cors from "cors";
import bodyParser from "body-parser";
import Razorpay from "razorpay";
import crypto from "crypto";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getDatabase,
  ref as dbRef,
  push,
  set,
  get,
  serverTimestamp,
} from "firebase/database";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const razorpayInstance = new Razorpay({
  key_id: process.env.RZP_KEY_ID,
  key_secret: process.env.RZP_SECRET_KEY,
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const database = getDatabase(app);
const auth = getAuth();

const server = express();
// Trust the first proxy
server.set("trust proxy", 1);
const upload = multer({ storage: multer.memoryStorage() });

server.use(cors());
server.use(express.json()); // Built-in body-parser for JSON
server.use(express.urlencoded({ extended: true })); // Built-in body-parser for URL-encoded data
server.use(bodyParser.json());

// API Security
server.use(helmet());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});

// Apply global limiter to all requests
server.use(globalLimiter);

// Authentication-specific limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 10 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
});

// Payment-specific limiter
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 5 requests per windowMs
  message: "Too many payment attempts, please try again later.",
});

server.get("/", (req, res) => {
  res.send("App is working");
});

// Register the User
server.post("/api/register", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    // Register the user with Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Store user information in Firestore
    await set(dbRef(database, `users/${user.uid}`), {
      uid: user.uid,
      email: user.email,
    });

    // Send email verification
    await sendEmailVerification(user);

    // Generate a token for the user
    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    // Respond with a message indicating the verification email has been sent
    res.status(200).json({
      message: "Registration successful. A verification email has been sent.",
      token,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      res.status(400).json({ message: "Email is already in use" });
    } else {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Error registering user", error });
    }
  }
});
// Login the User
server.post("/api/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    res.status(200).json({ message: "Login successful", token, emailVerified: user.emailVerified });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Error logging in", error });
  }
});

// Forgot the Reset Password
server.post("/api/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is Required" });
  }

  try {
    await sendPasswordResetEmail(auth, email);
    res.status(200).json({ message: "Password reset email sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending password reset email", error });
  }
});

// token verification
// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];

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

// Get the user Data
server.get("/api/user-profile", verifyToken, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userRef = dbRef(database, `users/${uid}`);
    const userSnapshot = await get(userRef);

    if (userSnapshot.exists()) {
      const userData = userSnapshot.val();
      res.status(200).json({ message: "User profile sent", user: userData });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Team registration form
server.post("/api/register-team", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { formDetails, teamMembers } = req.body;

  if (!formDetails || !teamMembers) {
    return res.status(400).json({ error: "Missing team details" });
  }

  try {
    // Reference to the user data
    const userRef = dbRef(database, `users/${uid}`);

    // Fetch the existing user data
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update only the team details, preserving the existing email
    await set(userRef, {
      ...userData, // Preserve existing data including email
      team: {
        teamName: formDetails.teamName,
        country: formDetails.country,
        competitionTopic: {
          ageGroup: formDetails.ageGroup,
          topic: formDetails.topic,
          category: formDetails.category,
        },
        mentor: {
          name: formDetails.mentorName,
          age: formDetails.mentorAge,
          email: formDetails.mentorEmail,
          phone: formDetails.mentorPhone,
        },
        members: teamMembers,
      },
      teamRegistered: true,
      paymentStatus: "pending",
      amountDue: formDetails.amountDue,
    });

    res.status(200).json({ message: "Team registered successfully" });
  } catch (error) {
    console.error("Error registering team:", error);
    res.status(500).json({ error: "Error registering team" });
  }
});

// Payment Gateway
server.post("/api/payment", paymentLimiter, (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "amount: is required.",
        metadata: {},
        reason: "input_validation_failed",
        source: "business",
        step: "payment_initiation",
      },
    });
  }

  try {
    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: crypto.randomBytes(10).toString("hex"),
    };

    razorpayInstance.orders.create(options, (err, order) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to create order" });
      }
      return res.status(200).json({ data: order });
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
    console.log(error);
  }
});

// Payment Verification
server.post("/api/verify", verifyToken, paymentLimiter, async (req, res) => {
  const { uid } = req.user;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  try {
    if (
      !uid ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({ message: "Missing required parameters" });
    }
    // Create sign string by concatenating order_id and payment_id
    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    // Create ExpectedSign by hashing the sign string with the Razorpay secret key
    const expectedSign = crypto
      .createHmac("sha256", process.env.RZP_SECRET_KEY)
      .update(sign)
      .digest("hex");

    // Compare the expectedSign with the received signature
    const paymentVerified = expectedSign === razorpay_signature;

    // Save payment data to Firebase Realtime Database
    const userRef = dbRef(database, `users/${uid}`);

    // Fetch existing user data
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.val();

    if (userData) {
      // Add payment details to existing user data
      const updatedUserData = {
        ...userData,
        teamRegistered: true,
        paymentStatus: paymentVerified ? "completed" : "failed",
        amountDue: 0, // Set amount due to 0 to avoid unnecessary updates
        payments: {
          ...(userData.payments || {}),
          [razorpay_payment_id]: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            paymentVerified,
          },
        },
      };

      // Update user data with payment details
      await set(userRef, updatedUserData);
    }

    // Send response based on payment verification status
    if (paymentVerified) {
      return res.status(200).json({ message: "Payment verified successfully" });
    } else {
      return res.status(400).json({ message: "Payment verification failed" });
    }
  } catch (error) {
    console.error("Payment verification error:", error); // Log error details for troubleshooting
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Resend Email Verification Endpoint
server.post('/api/resend-verification', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    // Check if the user exists in Firestore
    const usersRef = collection(database, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userDoc = querySnapshot.docs[0].data();

    // Check if the user has a valid Firebase Auth user ID
    if (!userDoc.uid) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch the user from Firebase Auth
    const user = await getUser(auth, userDoc.uid);

    // Check if the email is already verified
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Send email verification
    await sendEmailVerification(user);
    res.status(200).json({ message: 'Verification email sent successfully' });

  } catch (error) {
    console.error('Error resending verification email:', error);
    res.status(500).json({ message: 'Error resending verification email', error });
  }
});

// Get the User Details

// Check the Team Name Uniqueness
server.get("/api/check-team-name", verifyToken, async (req, res) => {
  const { teamName } = req.query;

  if (!teamName) {
    return res.status(400).json({ message: "Team name is required" });
  }

  try {
    const usersRef = dbRef(database, "users");
    const snapshot = await get(usersRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      const teamNames = Object.values(data)
        .map((user) => user.team?.teamName?.toLowerCase())
        .filter(Boolean);

      if (teamNames.includes(teamName.toLowerCase())) {
        return res.status(200).json({ exists: true });
      }
    }

    res.status(200).json({ exists: false });
  } catch (error) {
    console.error("Error checking team name:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Check the verification Email
server.post("/api/check-verification", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    if (user.emailVerified) {
      res.status(200).json({ message: "Email is verified" });
    } else {
      res.status(200).json({ message: "Email is not verified" });
    }
  } catch (error) {
    console.error("Error checking email verification:", error);
    res
      .status(500)
      .json({ message: "Error checking email verification", error });
  }
});

// Admin panel route - upload Auth code and certificate (At the Moment Not in Use)
server.post("/api/upload", upload.single("certificate"), async (req, res) => {
  const { authCode } = req.body;
  const file = req.file;

  if (!authCode || !file) {
    return res
      .status(400)
      .json({ message: "Auth Code and Certificate are required" });
  }

  try {
    // Upload file to Firebase Storage
    const storageRef = ref(
      storage,
      `certificates/${Date.now()}-${file.originalname}`
    );
    const snapshot = await uploadBytes(storageRef, file.buffer);
    const downloadURL = await getDownloadURL(snapshot.ref);

    // Save Auth Code and file URL to Firebase Realtime Database
    const newUploadRef = push(dbRef(database, "certificates"));

    await set(newUploadRef, {
      id: newUploadRef.key,
      authCode,
      certificateUrl: downloadURL,
      uploadedAt: serverTimestamp(),
    });

    res.status(200).json({ message: "Upload successful", downloadURL });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Error uploading file", error });
  }
});
// Admin panel route - upload AuthCode, Name, and academic in database
server.post("/api/save-details", async (req, res) => {
  const { authCode, name, academicYear } = req.body;

  if (!authCode || !name || !academicYear) {
    return res
      .status(400)
      .json({ message: "Auth Code, Name, and Academic Year are required" });
  }

  try {
    const newDetailsRef = push(dbRef(database, "certificate-details"));
    await set(newDetailsRef, {
      authCode,
      name,
      academicYear,
    });

    res.status(200).json({ message: "Details saved successfully" });
  } catch (error) {
    console.error("Error saving details:", error);
    res.status(500).json({ message: "Error saving details", error });
  }
});

server.post("/api/verify", async (req, res) => {
  const { authCode } = req.body;

  if (!authCode) {
    return res.status(400).json({ message: "Auth Code is required" });
  }

  try {
    // Query Firebase Realtime Database for the given Auth Code
    const uploadsRef = dbRef(database, "certificates");

    // Fetch all child nodes under 'uploads'
    const snapshot = await get(uploadsRef);

    if (snapshot.exists()) {
      // Iterate through the children to find a matching authCode
      const data = snapshot.val();
      for (const key in data) {
        if (data[key].authCode === authCode) {
          return res
            .status(200)
            .json({ certificateUrl: data[key].certificateUrl });
        }
      }
    } else {
      res.status(404).json({ message: "No record found for this Auth Code" });
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Error fetching data", error });
  }
});

// Register the Campus Ambassador
server.post("/api/campus-ambassador", async (req, res) => {
  const {
    name,
    email,
    phone,
    state,
    city,
    college,
    yearOfStudy,
    degreeProgram,
  } = req.body;

  if (
    !name ||
    !email ||
    !phone ||
    !state ||
    !city ||
    !college ||
    !yearOfStudy ||
    !degreeProgram
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Save the Campus Ambassador details to Firebase Realtime Database
    const newCampusAmbassadorRef = push(dbRef(database, "campus-ambassadors"));
    await set(newCampusAmbassadorRef, {
      name,
      email,
      phone,
      state,
      city,
      college,
      yearOfStudy,
      degreeProgram,
      createdAt: new Date().toISOString(),
    });
    res
      .status(200)
      .json({ message: "Campus Ambassador registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
