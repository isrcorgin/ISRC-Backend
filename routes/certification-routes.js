import express from 'express';
import { dbRef, push, set, database, get } from '../config/firebase-config.js'; // Adjust imports based on your setup

const certificationFormRouter = express.Router();

// Function to handle certification form submission
async function handleCertificationFormSubmission(formData) {
    try {
        // Validate the form data
        if (!formData) {
            throw new Error('Form data is missing or empty');
        }

        // Reference to the "CertificationForms" node in the database
        const certificationFormsRef = dbRef(database, 'certificationForms'); 

        // Generating a unique key using push
        const newCertificationFormRef = push(certificationFormsRef);

        // Storing form data in the database under the new unique key
        await set(newCertificationFormRef, formData);

        console.log("Certification form data stored successfully!");
        
    } catch (error) {
        console.error('Error storing certification form data:', error);
        throw new Error('Failed to store certification form data');
    }
}

// Route to handle certification form submission
certificationFormRouter.post('/submit-certification-form', async (req, res) => {
    const { formData } = req.body; // Extract form data from the request body

    try {
        await handleCertificationFormSubmission(formData);
        res.status(200).json({ message: 'Certification form submitted successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit certification form', error: error.message });
    }
});

// Route to get all submitted certification forms
certificationFormRouter.get('/get-all-certification-forms', async (req, res) => {
    try {
        // Reference to the "CertificationForms" node in the database
        const certificationFormsRef = dbRef(database, 'certificationForms');
        
        // Retrieve all certification forms
        const snapshot = await get(certificationFormsRef);
        
        if (snapshot.exists()) {
            // Convert snapshot to JSON
            const certificationForms = snapshot.val();
            res.status(200).json(certificationForms);
        } else {
            res.status(404).json({ message: 'No certification forms found' });
        }
    } catch (error) {
        console.error('Error retrieving certification forms:', error);
        res.status(500).json({ message: 'Failed to retrieve certification forms', error: error.message });
    }
});

export default certificationFormRouter;
