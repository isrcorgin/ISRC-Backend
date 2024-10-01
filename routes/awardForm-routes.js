import express from 'express';
import { dbRef, push, set, database, get, update, remove } from '../config/firebase-config.js'; // Adjust imports based on your setup

const formRouter = express.Router();

// Function to handle form submission
async function handleFormSubmission(formData) {
    try {
        // Validate the form data (you can add more validation as per your requirements)
        if (!formData) {
            throw new Error('Form data is missing or empty');
        }

        // Reference to the "Forms" node in the database
        const formsRef = dbRef(database, 'forms'); 

        // Generating a unique key using push
        const newFormRef = push(formsRef);

        // Storing form data in the database under the new unique key
        await set(newFormRef, formData);

        console.log("Form data stored successfully!");
        
    } catch (error) {
        console.error('Error storing form data:', error);
        throw new Error('Failed to store form data');
    }
}

// Route to handle form submission
formRouter.post('/submit-form', async (req, res) => {
    const { formData } = req.body; // Extract form data from the request body

    try {
        await handleFormSubmission(formData);
        res.status(200).json({ message: 'Form submitted successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit form', error: error.message });
    }
});

// Route to get all submitted forms
formRouter.get('/get-all-form', async (req, res) => {
  try {
      // Reference to the "Forms" node in the database
      const formsRef = dbRef(database, 'forms');
      
      // Retrieve all forms
      const snapshot = await get(formsRef);
      
      if (snapshot.exists()) {
          // Convert snapshot to JSON
          const forms = snapshot.val();
          res.status(200).json(forms);
      } else {
          res.status(404).json({ message: 'No forms found' });
      }
  } catch (error) {
      console.error('Error retrieving forms:', error);
      res.status(500).json({ message: 'Failed to retrieve forms', error: error.message });
  }
});

// Route to update a form
formRouter.post('/update-form', async (req, res) => {
    const {id, isSelected, viewed } = req.body;
  
    try {
      // Reference to the specific form
      const formRef = dbRef(database, `forms/${id}`);
  
      // Update the form's isSelected and viewed status
      await update(formRef, {
        isSelected,
        viewed
      });
  
      res.status(200).json({ message: 'Form updated successfully' });
    } catch (error) {
      console.error('Error updating form:', error);
      res.status(500).json({ message: 'Failed to update form', error: error.message });
    }
});
// Routes to delete a form
formRouter.delete('/delete-form/:uid', async (req, res) =>  {
  const {uid} = req.params;

  try {
    const formRef = dbRef(database, `forms/${uid}`)

    const snapshot = await get(formRef)

    if(!snapshot.exists()){
      return res.status(404).json({message: 'Form not found'})
    }
    // Delete the form from the database
    await remove(formRef)

    res.status(200).json({message: 'Form deleted successfully'})
  } catch (error) {
    console.log("Error While deleting the form", error)
    res.status(500).json({message: 'Error while deleting the form', error: error.message})
  }
})

// Route to add a certificate from a from
formRouter.post('/add-certificate-form', async (req, res) => {
    const { authCode, name, type, whatsapp } = req.body;
  
    try {
      // Reference to the "certificate" node in the database
      const certificatesRef = dbRef(database, 'certificates');
  
      // Add new certificate to the collection with a unique key
      const newCertificateRef = push(certificatesRef);
      await set(newCertificateRef, {
        authCode,
        name,
        type,
        whatsapp
      });
  
      res.status(200).json({ message: 'Certificate added successfully' });
    } catch (error) {
      console.error('Error adding certificate:', error);
      res.status(500).json({ message: 'Failed to add certificate', error: error.message });
    }
});


export default formRouter;
