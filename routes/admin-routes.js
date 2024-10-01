import express from "express";
import {
  auth,
  database,
  storage,
  deleteObject,
  push,
  dbRef,
  set,
  get,
  remove,
  update,
  sendEmailVerification,
  createUserWithEmailAndPassword,
  ref,
  uploadBytes,
  getDownloadURL,
  signInWithEmailAndPassword
} from '../config/firebase-config.js'; // Adjust the path if necessary
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from "sharp";
import { v4 as uuidv4 } from 'uuid';
import XLSX from "xlsx"
import verifyToken from "../middleware/authToken.js";


// Configure storage

const upload = multer({ storage: multer.memoryStorage() });

// Routes for admin panel  
const adminRouter = express.Router()


// admin Register Route
adminRouter.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await set(dbRef(database, `admin/${user.uid}`), {
      uid: user.uid,
      email: user.email,
    });

    await sendEmailVerification(user);

    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    res.status(200).json({
      message: "Admin registration successful. A verification email has been sent.",
      token,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      res.status(400).json({ message: "Email is already in use" });
    } else {
      console.error("Error registering admin:", error);
      res.status(500).json({ message: "Error registering admin", error });
    }
  }
});

// admin Login Route
adminRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password are required" });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const token = jwt.sign({ uid: user.uid }, process.env.JWT_SECRET);

    res.status(200).json({
      message: "Admin login successful",
      token,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    console.error("Error logging in admin:", error);
    res.status(500).json({ message: "Error logging in admin", error });
  }
});

// Route to save the Indian Ambassador details
adminRouter.post("/add-campus-ambassador", upload.single('image'), async (req, res) => {
  const { name, linkedInLink, place} = req.body;
  const image = req.file;

  if (!name || !linkedInLink || !place || !image) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Generate unique ID for the image
    const uniqueId = uuidv4();
    const imageName = `${uniqueId}_${image.originalname}`;

    // Optimize image using sharp
    const optimizedImageBuffer = await sharp(image.buffer)
      .resize({ width: 800 }) // Resize to 800px width, maintain aspect ratio
      .webp({ quality: 80 })  // Convert to WebP with quality of 80
      .toBuffer();

    // Upload image to Firebase Storage
    const imageRef = ref(storage, `campus_ambassadors_web/${imageName}`);
    await uploadBytes(imageRef, optimizedImageBuffer);
    const imageUrl = await getDownloadURL(imageRef);

    // Save details to Firebase Realtime Database
    const newAmbassadorRef = push(dbRef(database, 'campus_ambassadors_web'));
    await set(newAmbassadorRef, {
      id: newAmbassadorRef.key,
      name,
      linkedInLink,
      place,
      imageUrl
    });

    res.status(200).json({ message: 'Campus Ambassador added successfully' });
  } catch (error) {
    console.error('Error adding campus ambassador:', error);
    res.status(500).json({ message: 'Error adding campus ambassador', error });
  }
});

// Route to save the International Campus Ambassador
adminRouter.post('/add-international-campus-ambassador', upload.single('image'), async (req, res) => {
  const { name, linkedInLink, place } = req.body;
  const image = req.file;

  if (!name || !linkedInLink || !place || !image) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Generate unique ID for the image
    const uniqueId = uuidv4();
    const imageName = `${uniqueId}_${image.originalname}`;

    // Optimize image using sharp
    const optimizedImageBuffer = await sharp(image.buffer)
      .resize({ width: 800 }) // Resize to 800px width, maintain aspect ratio
      .webp({ quality: 80 })  // Convert to WebP with quality of 80
      .toBuffer();

    // Upload image to Firebase Storage
    const imageRef = ref(storage, `international_campus_ambassadors_web/${imageName}`);
    await uploadBytes(imageRef, optimizedImageBuffer);
    const imageUrl = await getDownloadURL(imageRef);

    // Save details to Firebase Realtime Database
    const newAmbassadorRef = push(dbRef(database, 'international_campus_ambassadors_web'));
    await set(newAmbassadorRef, {
      id: newAmbassadorRef.key,
      name,
      linkedInLink,
      place,
      imageUrl
    });

    res.status(200).json({ message: 'International Campus Ambassador added successfully' });
  } catch (error) {
    console.error('Error adding international campus ambassador:', error);
    res.status(500).json({ message: 'Error adding international campus ambassador', error });
  }
});

// Route to get all the Campus Ambassador Details
adminRouter.get("/all-campus-ambassadors", async (req, res) => {
  try {
    // Reference to the campus ambassadors collection in Firebase Realtime Database
    const campusAmbassadorsRef = dbRef(database, 'campus_ambassadors_web');

    // Fetch the data
    const snapshot = await get(campusAmbassadorsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      res.status(200).json(data);
    } else {
      res.status(404).json({ message: 'No campus ambassadors found' });
    }
  } catch (error) {
    console.error('Error fetching campus ambassadors:', error);
    res.status(500).json({ message: 'Error fetching campus ambassadors', error });
  }
});

// Route to get all the International Campus Ambassador Details

adminRouter.get("/all-international-campus-ambassadors", async (req, res) => {
  try {
    // Reference to the international campus ambassadors collection in Firebase Realtime Database
    const internationalAmbassadorsRef = dbRef(database, 'international_campus_ambassadors_web');

    // Fetch the data
    const snapshot = await get(internationalAmbassadorsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      res.status(200).json(data);
    } else {
      res.status(404).json({ message: 'No international campus ambassadors found' });
    }
  } catch (error) {
    console.error('Error fetching international campus ambassadors:', error);
    res.status(500).json({ message: 'Error fetching international campus ambassadors'})
    }
  })

// Route to update the Campus Ambassador
adminRouter.put("/update-campus-ambassador/:id", async (req, res) => {
  const { id } = req.params;
  const { name, linkedInLink, place } = req.body;

  try {

    const ambassadorRef = dbRef(database, `campus_ambassadors_web/${id}`);
    const ambassadorSnapshot = await get(ambassadorRef);

    if (!ambassadorSnapshot.exists()) {
      return res.status(404).json({ message: "Campus Ambassador not found" });
    }

    let updatedData = {};

    if (name) {
      updatedData.name = name;
    }
    if (linkedInLink) {
      updatedData.linkedInLink = linkedInLink;
    }
    if (place) {
      updatedData.place = place;
    }


    if (Object.keys(updatedData).length > 0) {
      await update(ambassadorRef, updatedData);
      return res.status(200).json({ message: 'Campus Ambassador updated successfully' });
    } else {
      return res.status(400).json({ message: 'No data provided for update' });
    }
  } catch (error) {
    console.error('Error updating campus ambassador:', error.message);
    return res.status(500).json({ message: 'Error updating campus ambassador', error });
  }
});



// Route to delete the Campus Ambassador
adminRouter.delete('/delete-campus-ambassador/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Reference to the specific campus ambassador record in Firebase Realtime Database
    const campusAmbassadorRef = dbRef(database, `campus_ambassadors_web/${id}`);

    // Fetch the current record to get the image URL
    const snapshot = await get(campusAmbassadorRef);
    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Campus ambassador not found.' });
    }

    const ambassadorData = snapshot.val();
    const imageUrl = ambassadorData.imageUrl;

    // Delete the record from Firebase Realtime Database
    await remove(campusAmbassadorRef);

    if (imageUrl) {
      // Extract the image path from the URL
      const encodedImagePath = imageUrl.split('/o/')[1].split('?')[0]; // URL-encoded path
      const imagePath = decodeURIComponent(encodedImagePath); // Decode the URL-encoded path
    
      // Create a reference to the image in Firebase Storage
      const imageRef = ref(storage, imagePath);
    
      // Delete the image from Firebase Storage
      await deleteObject(imageRef);
    }

    res.status(200).json({ message: 'Campus ambassador and associated image deleted successfully.' });
  } catch (error) {
    console.error('Error deleting campus ambassador or image:', error);
    res.status(500).json({ message: 'Error deleting campus ambassador or image', error });
  }
});

// Route to get All the Users
adminRouter.get("/all-users", async (req, res) => {

  try {
    const userRef = dbRef(database, "users");

    const snapshot = await get(userRef);

    if(snapshot.exists()){
      const data = snapshot.val();
      res.status(200).json(data);
    }
    else{
      res.status(404).json({ message: 'No users found' });
    }
  } catch (error) {
    res.status(500).json({message: "Error while Getting users", error: error.message})
  }
})

// Route to Mark the Team Attendance
adminRouter.get('/attendance/mark/:uid', async (req, res) => {
  const uid = req.params.uid;

  if (!uid) {
    return res.status(400).json({ message: 'UID is required' });
  }

  try {
    // Reference to the user in the database
    const userRef = dbRef(database, `users/${uid}`);
    
    // Retrieve existing user data
    const userSnapshot = await get(userRef);
    if (!userSnapshot.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get the existing data and update the attendance attribute
    const userData = userSnapshot.val();
    userData.attendance = true;

    // Set the updated data back to the database
    await set(userRef, userData);

    res.status(200).json({ message: `Attendance marked for user ${uid}` });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Error marking attendance' });
  }
});

// Admin panel route - upload AuthCode, type, date, campusAmbassador in database
adminRouter.post("/generate-certificate", async (req, res) => {
  const { authCode, type, campusAmbassador, date, school, academicYear } = req.body;

  if (!authCode || !type || !campusAmbassador || !date || !school || !academicYear) {
    return res
      .status(400)
      .json({ message: "Auth Code, Type, Campus Ambassador, Date, Academic Year and School are required" });
  }

  try { 
    const newDetailsRef = push(dbRef(database, "certificates"));
    await set(newDetailsRef, {
      authCode,
      type,
      campusAmbassador,
      date,
      school,
      academicYear
    });

    res.status(200).json({ message: "Details saved successfully" });
  } catch (error) {
    console.error("Error saving details:", error);
    res.status(500).json({ message: "Error saving details", error });
  }
});


// Route to get all session certificate details
adminRouter.get('/all-sessioncertificates', async (req, res) => {
  try {
    const certificatesRef = dbRef(database, 'certificationForms');
    const snapshot = await get(certificatesRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'No certificates found' });
    }

    const certificates = snapshot.val();
    res.status(200).json(certificates);
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

adminRouter.post("/generate-workshop-certificate", async(req, res) => {

  const {name, type, authCode, awardedOn, year, description} = req.body

  if(!name || !type || !authCode, !awardedOn, !year, !description){
    return res.status(400).json({message: "Name, Type, Auth Code, Awarded On, Year and Description are required"})
  }

  try {
    const newCertificateRef = push(dbRef(database, "certificates"))

    await set(newCertificateRef, {
      name,
      type,
      authCode,
      awardedOn,
      year,
      description
    })

    res.status(200).json({message: "Workshop Certificate saved successfully"})
  } catch (error) {
    console.error("Error saving workshop certificate:", error)
    res.status(500).json({message: "Error saving workshop certificate", error})
  }
})

// Upload Bulk excel
adminRouter.post('/upload-excel', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // Load the Excel file from the buffer
    const workbook = XLSX.read(file.buffer);

    // Check if workbook has sheets
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in the workbook');
    }

    // Extract the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }

    // Convert sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

    // Prepare batch updates
    const updates = {};

    // Process each row and prepare batch updates
    for (const record of data) {
      const newRecord = {};
      let isValid = true;

      // Iterate over each column in the record
      for (const [key, value] of Object.entries(record)) {
        // Convert the value to a string and add it to the new record object
        newRecord[key] = String(value || '');

        // Check if any field is missing
        if (!newRecord[key]) {
          isValid = false;
          break; // Exit the loop if any field is missing
        }
      }

      if (!isValid) {
        console.log('Skipping record due to missing fields:', newRecord);
        continue; // Skip this record if any field is missing
      }

      // Generate a new unique ID and create a new record entry in the updates object
      const newRecordRef = push(dbRef(database, 'certificates'));
      updates[`certificates/${newRecordRef.key}`] = newRecord;
    }

    // Perform batch update to Firebase Realtime Database
    await update(dbRef(database), updates);

    res.status(200).json({ message: 'Excel file processed and records added successfully' });
  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ message: 'Error processing Excel file', error });
  }
});

// Return the Certificate detail which is in excel
adminRouter.post('/get-all-certificate-excel', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // Load Excel file from buffer
    const workbook = XLSX.read(file.buffer);

    // Extract the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }

    // Convert sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

    // Retrieve all certificates from Firebase
    const certificatesRef = dbRef(database, 'certificates');
    const snapshot = await get(certificatesRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'No certificates found in database.' });
    }

    const allCertificates = snapshot.val();
    const certificatesToReturn = [];

    // Iterate through each record in the Excel file
    for (const record of data) {
      const { authCode } = record;

      if (!authCode) {
        console.log('Skipping record due to missing authCode:', record);
        continue;
      }

      // Find the certificate that matches the authCode
      const matchingCertificate = Object.values(allCertificates).find(
        (certificate) => certificate.authCode === authCode
      );

      if (!matchingCertificate) {
        console.log(`No certificate found for authCode: ${authCode}`);
        continue;
      }

      // Add matching certificate to the return array
      certificatesToReturn.push(matchingCertificate);
    }

    res.status(200).json({ certificates: certificatesToReturn });
  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ message: 'Error processing Excel file', error });
  }
});
// Route to get all certificate details
adminRouter.get('/all-certificates', async (req, res) => {
  try {
    const certificatesRef = dbRef(database, 'certificates');
    const snapshot = await get(certificatesRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'No certificates found' });
    }

    const certificates = snapshot.val();
    res.status(200).json(certificates);
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Route to delete a particular certificate 
adminRouter.delete("/remove-certificate/:uid", async (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res
      .status(400)
      .json({ message: "UID parameter is required" });
  }

  try {
    // Reference to the certificate node
    const certificateRef = dbRef(database, `certificates/${uid}`);

    // Check if the certificate exists
    const snapshot = await get(certificateRef);
    if (!snapshot.exists()) {
      return res
        .status(404)
        .json({ message: "Certificate not found" });
    }

    // Remove the certificate from the database
    await remove(certificateRef);

    res.status(200).json({ message: "Certificate removed successfully" });
  } catch (error) {
    console.error("Error removing certificate:", error);
    res.status(500).json({ message: "Error removing certificate", error });
  }
});

// Update the User Profile
adminRouter.put('/update-user/:uid',  async (req, res) => {
  const { uid } = req.params; // Get user ID from token
  const { mentor, members } = req.body;

  if (!mentor || !members) {
    return res.status(400).json({ error: "Missing mentor or members details" });
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

    // Update the team details
    await set(userRef, {
      ...userData, // Preserve existing data
      team: {
        ...userData.team, // Preserve existing team data
        mentor: mentor,
        members: members,
      },
    });

    res.status(200).json({ message: "User details updated successfully" });
  } catch (error) {
    console.error("Error updating user details:", error);
    res.status(500).json({ error: "Error updating user details" });
  }
});

// get user details
adminRouter.get("/user-profile/:uid",  async (req, res) => {
  const { uid } = req.params;
  console.log(uid)

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
    console.log(error)
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default adminRouter