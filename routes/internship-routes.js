import express from 'express';
import { dbRef, push, set, database, get } from '../config/firebase-config.js'; // Adjust imports based on your setup

const internshipFormRouter = express.Router();

// Function to handle internship form submission
async function handleInternshipFormSubmission(formData) {
    try {
        // Validate the form data (you can add more validation as per your requirements)
        if (!formData) {
            throw new Error('Form data is missing or empty');
        }

        // Reference to the "InternshipForms" node in the database
        const internshipFormsRef = dbRef(database, 'internshipForms'); 

        // Generating a unique key using push
        const newInternshipFormRef = push(internshipFormsRef);

        // Storing form data in the database under the new unique key
        await set(newInternshipFormRef, formData);

        console.log("Internship form data stored successfully!");
        
    } catch (error) {
        console.error('Error storing internship form data:', error);
        throw new Error('Failed to store internship form data');
    }
}

// Route to handle internship form submission
internshipFormRouter.post('/submit-internship-form', async (req, res) => {
    const { formData } = req.body; // Extract form data from the request body

    try {
        await handleInternshipFormSubmission(formData);
        res.status(200).json({ message: 'Internship form submitted successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit internship form', error: error.message });
    }
});

// Route to get all submitted internship forms
internshipFormRouter.get('/get-all-internship-forms', async (req, res) => {
    try {
        // Reference to the "InternshipForms" node in the database
        const internshipFormsRef = dbRef(database, 'internshipForms');
        
        // Retrieve all internship forms
        const snapshot = await get(internshipFormsRef);
        
        if (snapshot.exists()) {
            // Convert snapshot to JSON
            const internshipForms = snapshot.val();
            res.status(200).json(internshipForms);
        } else {
            res.status(404).json({ message: 'No internship forms found' });
        }
    } catch (error) {
        console.error('Error retrieving internship forms:', error);
        res.status(500).json({ message: 'Failed to retrieve internship forms', error: error.message });
    }
});

export default internshipFormRouter;
