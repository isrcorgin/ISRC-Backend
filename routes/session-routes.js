import express from 'express';
import { dbRef, push, set, database, get } from '../config/firebase-config.js'; // Adjust imports based on your setup
import { v4 as uuidv4 } from 'uuid'; // For generating random UUIDs for authcode


const sessionFormRouter = express.Router();

// Function to handle session form submission
async function handleSessionFormSubmission(formData) {
    try {
        // Validate the form data (you can add more validation as per your requirements)
        if (!formData) {
            throw new Error('Form data is missing or empty');
        }

        // Reference to the "SessionForms" node in the database
        const sessionFormsRef = dbRef(database, 'sessionForms'); 

        // Generating a unique key using push
        const newSessionFormRef = push(sessionFormsRef);

        // Storing form data in the database under the new unique key
        await set(newSessionFormRef, formData);

        console.log("Session form data stored successfully!");
        
    } catch (error) {
        console.error('Error storing session form data:', error);
        throw new Error('Failed to store session form data');
    }
}

function generateAuthCode() {
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000); // Generates a random 8-digit number
    return `SEC${randomDigits}`; // Concatenates 'SEC' with the random 8 digits
  }
  
// Function to check for duplicate certificates
async function isCertificateGenerated(userId) {
    const sessCertificsRef = dbRef(database, `certificates/${-userId}`);
    const snapshot = await get(sessCertificsRef);
    return snapshot.exists();
}

// Route to handle session form submission
sessionFormRouter.post('/submit-session-form', async (req, res) => {
    const { formData } = req.body; // Extract form data from the request body

    try {
        await handleSessionFormSubmission(formData);
        res.status(200).json({ message: 'Session form submitted successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit session form', error: error.message });
    }
});

// Route to get all submitted session forms
sessionFormRouter.get('/get-all-session-forms', async (req, res) => {
  try {
      // Reference to the "SessionForms" node in the database
      const sessionFormsRef = dbRef(database, 'certificationForms');
      
      // Retrieve all session forms
      const snapshot = await get(sessionFormsRef);
      
      if (snapshot.exists()) {
          // Convert snapshot to JSON
          const sessionForms = snapshot.val();
          res.status(200).json(sessionForms);
      } else {
          res.status(404).json({ message: 'No session forms found' });
      }
  } catch (error) {
      console.error('Error retrieving session forms:', error);
      res.status(500).json({ message: 'Failed to retrieve session forms', error: error.message });
  }
});


//to get numbers of users
sessionFormRouter.get('/get-user-numbers', async (req, res) => {
    try {
        // Reference to the "SessionForms" node in the database
        const sessionFormsRef = dbRef(database, 'sessionForms');
        
        // Retrieve all session forms
        const snapshot = await get(sessionFormsRef);
        
        if (snapshot.exists()) {
            // Convert snapshot to JSON
            const sessionForms = snapshot.val();
            
            // Extract phone numbers (assuming each session form has a 'phoneNumber' property)
            const phoneNumbers = Object.values(sessionForms)
                .map(form => form.number)
            
            res.status(200).json({ phoneNumbers });
        } else {
            res.status(404).json({ message: 'No session forms found' });
        }
    } catch (error) {
        console.error('Error retrieving user phone numbers:', error);
        res.status(500).json({ message: 'Failed to retrieve user phone numbers', error: error.message });
    }
});


//send only one certification of user 
sessionFormRouter.post('/generate-one-certificate/:userId', async (req, res) => {
    const { userId } = req.params;
    console.log(userId);
    
    try {
      // Reference to the user form data (assuming it's in 'sessionForms' node)
      const userFormRef = dbRef(database, `certificationForms/${userId}`);
      const userSnapshot = await get(userFormRef);
      console.log(userSnapshot.exists());
      
      
      if (!userSnapshot.exists()) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      const userData = userSnapshot.val();
      const { name,whatsapp } = userData; // Extract the user's name from form data
  
      // Check if a certificate is already generated for the user
      const alreadyGenerated = await isCertificateGenerated(userId);
      if (alreadyGenerated) {
        return res.status(400).json({ message: 'Certificate already generated for this user' });
      }
  
      // Generate a new certificate with an auth code
      const authCode = generateAuthCode();
      const certData = {
        name, // Include the user's name
        whatsapp,
        type: 'sec', // Set the type as 'SEC'
        authCode,
        
        // new Date().toISOString()
      };
  
      // Save the certificate under the new node "certificates"
      const sessCertificsRef = dbRef(database, `certificates/${userId}`);
      await set(sessCertificsRef, certData);
  
      res.status(200).json({ message: 'Certificate generated successfully', authCode, name, type: 'SEC' });
    } catch (error) {
      console.error('Error generating certificate:', error);
      res.status(500).json({ message: 'Failed to generate certificate', error: error.message });
    }
  });
  
//send all certificate of user
sessionFormRouter.post('/generate-all-certificates', async (req, res) => {
    try {
      // Reference to the "SessionForms" node in the database
      const sessionFormsRef = dbRef(database, 'certificationForms');
      const snapshot = await get(sessionFormsRef);
  
      if (!snapshot.exists()) {
        return res.status(404).json({ message: 'No session forms found' });
      }
  
      const sessionForms = snapshot.val();
      let generatedCount = 0;
  
      // Loop through all users
      for (const userId in sessionForms) {
        const userData = sessionForms[userId];
        const { name,whatsapp } = userData; // Extract user's name from form data
  
        // Check if a certificate already exists for this user
        const alreadyGenerated = await isCertificateGenerated(userId);
        if (alreadyGenerated) {
          console.log(`Certificate already exists for user ${userId}, skipping.`);
          continue; // Skip users who already have certificates
        }
  
        // Generate a new certificate with an auth code
        const authCode = generateAuthCode();
        const certData = {
          name, // Include the user's name
          type: 'sec', // Set the type as 'SEC'
          authCode,
          whatsapp,
        };
  
        // Save the certificate under the new node "certificates"
        const sessCertificsRef = dbRef(database, `certificates/${userId}`);
        await set(sessCertificsRef, certData);
  
        generatedCount++; // Increment the generated count
      }
  
      res.status(200).json({ message: `Generated ${generatedCount} certificates successfully.` });
    } catch (error) {
      console.error('Error generating certificates:', error);
      res.status(500).json({ message: 'Failed to generate certificates', error: error.message });
    }
  });







export default sessionFormRouter;
