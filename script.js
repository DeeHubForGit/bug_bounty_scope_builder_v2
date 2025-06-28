import { fetchMobileAppDetailsForDomain, fetchApiDetails } from './api.js';

// Config variable from template.json
let showApiDataButton = false;

// Function to load the API button visibility setting from the template JSON
async function loadConfigFromTemplate() {
  try {
    const response = await fetch('bug-bounty-document-template.json');
    if (response.ok) {
      const templateData = await response.json();
      if (templateData && templateData.config) {
        const config = templateData.config;

        if (typeof config.showApiDataButton === 'boolean') {
          showApiDataButton = config.showApiDataButton;
          console.log('API button visibility setting loaded:', showApiDataButton);
        }
      }
    }
  } catch (e) {
    console.error('Error loading API button config:', e);
  }
}

// State variables
let websiteSelected = false;
let mobileSelected = false;
let apiSelected = false;
let websiteCounter = 1;
let mobileCounter = 1;
let apiCounter = 1;
let stepsGenerated = false;

// Store API data for later access
let storedApiData = {
  mobileDetails: null,
  apiDetails: null,
  isLoading: false, // Track if we're currently loading API data
  error: null
};
let stepSequence = [];
let currentStepIndex = 0;
let wasAtRewardsStepWhenAddingNew = false;
let newSectionLastStepIndex = 0;
let setupMode = null;

/**
 * Show the loading indicator near the Next button
 */
function showGlobalLoadingMessage() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

/**
 * Hide the loading indicator
 */
function hideGlobalLoadingMessage() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

// Function to load API data in the background and handle state updates
async function loadApiDataInBackground(domain) {
  // Update state to loading
  storedApiData.loading = true;
  storedApiData.isLoading = true;
  storedApiData.error = null;
  
  // Show loading indicators
  showGlobalLoadingMessage();
  createViewApiDataButton();
  
  try {
    console.log("Loading API data in background for domain:", domain);
    
    // Check if we already have saved data for this domain
    const savedData = localStorage.getItem(`apiData_${domain}`);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        console.log("Found saved API data for domain:", domain);
        
        // Use saved data
        storedApiData.mobileDetails = parsedData.mobileDetails;
        storedApiData.apiDetails = parsedData.apiDetails;
        storedApiData.loading = false;
        storedApiData.isLoading = false;
        storedApiData.error = null;
        
        // Hide loading message and update the button state
        hideGlobalLoadingMessage();
        createViewApiDataButton();
        return;
      } catch (e) {
        console.warn("Error parsing saved API data, fetching fresh data", e);
        // Continue with fetching fresh data
      }
    }
    
    // Make API calls in parallel
    const [mobileRes, apiRes] = await Promise.all([
      fetchMobileAppDetailsForDomain(domain),
      fetchApiDetails(domain)
    ]);
    
    // Store API responses
    storedApiData.mobileDetails = mobileRes;
    storedApiData.apiDetails = apiRes;
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = null;
    
    console.log("Background API loading complete:");
    console.log("- Mobile API response:", mobileRes);
    console.log("- API Details response:", apiRes);
    
    // Save the API data to localStorage for persistence
    try {
      const dataToSave = {
        mobileDetails: mobileRes,
        apiDetails: apiRes
      };
      localStorage.setItem(`apiData_${domain}`, JSON.stringify(dataToSave));
      console.log("API data saved to localStorage for domain:", domain);
    } catch (saveError) {
      console.error("Error saving API data to localStorage:", saveError);
      // Continue execution even if saving fails
    }
    
    // Hide loading message and update the button state
    hideGlobalLoadingMessage();
    createViewApiDataButton();
  } catch (error) {
    console.error("Error fetching API data in background:", error);
    
    // Update error state
    storedApiData.loading = false;
    storedApiData.isLoading = false;
    storedApiData.error = {
      message: `Failed to load API data: ${error.message}`,
      details: "Please check that the API server is running and accessible."
    };
    
    // Hide loading message and create button that shows error state
    hideGlobalLoadingMessage();
    createViewApiDataButton();
  }
}

function showMessageModal(title, message) {
  const modal = document.getElementById('messageModal');
  const titleEl = document.getElementById('messageModalTitle');
  const bodyEl = document.getElementById('messageModalBody');
  const closeBtn = document.getElementById('closeMessageModal');

  titleEl.textContent = title || 'Notice';
  bodyEl.textContent = message || '';
  modal.classList.remove('hidden');

  closeBtn.onclick = () => {
    modal.classList.add('hidden');
  };
}

// Helper function to safely add steps to the sequence
function addToStepSequence(stepId) {
    if (!stepSequence.includes(stepId)) {
        console.log(`Adding ${stepId} to step sequence`);
        stepSequence.push(stepId);
        console.log('Current step sequence:', stepSequence);
        return true;
    }
    console.log(`Step ${stepId} already exists in sequence`);
    return false;
}

// Track when users have moved past the last step
let lastWebsiteIndex = -1;
let lastMobileIndex = -1;
let lastApiIndex = -1;

// Navigation functions (defined here to be hoisted)
async function goToNextStep() {
    console.log('Going to next step');
    console.log('Current Step Index:', currentStepIndex);
    console.log('Step Sequence:', stepSequence);
    
    // Don't proceed if we're already at the last step
    if (currentStepIndex >= stepSequence.length - 1) {
        return;
    }
    
    // Get the ID of the step we're about to navigate to
    const nextStepId = stepSequence[currentStepIndex + 1];
    const isAutoMode = localStorage.getItem('autoMode') === 'true';
    const isGoingToSummary = nextStepId === 'final-step';
    
    // Check if we're in auto mode and trying to go to the final step while API data is loading
    if (isAutoMode && isGoingToSummary && storedApiData.isLoading) {
        // API data is still loading, show message to wait
        showMessageModal('Loading Data', 'API data is still being fetched. Please wait a moment before proceeding to the summary.');
        return;
    }
    
    // If we get here, it's safe to proceed to the next step
    currentStepIndex++;
    await showStep(nextStepId);
    
    // Save the current step to localStorage
    localStorage.setItem('currentStepIndex', currentStepIndex);
    
    updateButtons();
    updateNavigationBar();
    updateStepListDisplay();
}

async function goToPreviousStep() {
    console.log('Going to previous step');
    console.log('Current Step Sequence:', stepSequence);
    console.log('Current Step Index:', currentStepIndex);
    
    if (currentStepIndex > 0) {
        currentStepIndex--;
        const prevStepId = stepSequence[currentStepIndex];
        await showStep(prevStepId);
        
        // Save the current step to localStorage
        localStorage.setItem('currentStepIndex', currentStepIndex);
    }
    
    updateButtons();
    updateNavigationBar();
    updateStepListDisplay();
}

async function jumpToEnd() {
    console.log('Jumping to end');
    if (stepSequence.length > 0) {
        currentStepIndex = stepSequence.length - 1;
        const lastStepId = stepSequence[currentStepIndex];
        await showStep(lastStepId);
        
        // Save the current step to localStorage
        localStorage.setItem('currentStepIndex', currentStepIndex);
        
        updateButtons();
        updateNavigationBar();
        updateStepListDisplay();
    }
}

// Expose navigation and wizard functions for HTML inline event handlers
window.goToNextStep = goToNextStep;
window.goToPreviousStep = goToPreviousStep;
window.jumpToEnd = jumpToEnd;
window.resetWizard = resetWizard;

// Initialize the app and handle page load
document.addEventListener('DOMContentLoaded', async function() {
  // Get current mode and step information
  const isAutoMode = localStorage.getItem('autoMode') === 'true';
  const savedStepIndex = parseInt(localStorage.getItem('currentStepIndex'), 10) || 0;
  const domain = localStorage.getItem('autoModeDomain');
  
  // Wait for a slight delay to ensure other initialization code has run
  setTimeout(async () => {
    // Check if we're on the initial screen (no steps generated yet)
    // Don't do anything if this is initial page load (no wizard started yet)
    const wizardStarted = localStorage.getItem('wizardStarted') === 'true';
    const stepsContainer = document.getElementById('stepContainer');
    
    if (!wizardStarted || !stepsContainer || stepsContainer.innerHTML.trim() === '') {
      console.log('Initial screen load - not adding any steps yet');
      return;
    }
    
    // Get the current step ID safely (in case stepSequence isn't loaded yet)
    const stepIdToShow = stepSequence && stepSequence.length > savedStepIndex ? stepSequence[savedStepIndex] : null;
    const isAtFinalOrRewardsStep = stepIdToShow === 'rewards-step' || stepIdToShow === 'final-step' || savedStepIndex >= (stepSequence?.length || 0) - 2;
  
    // Check if we need to regenerate the rewards step in any mode (but only if wizard has started)
    if (isAtFinalOrRewardsStep) {
      // Wait a short time to ensure other initialization runs first
      setTimeout(async () => {
        const rewardsStep = document.getElementById('rewards-step');
        if (!rewardsStep || !stepSequence.includes('rewards-step')) {
          console.log('Ensuring rewards step exists on page load');
          const { rewards } = await loadTemplate();
          
          // Create the rewards step if it doesn't exist
          if (!rewardsStep) {
            document.getElementById('stepContainer').insertAdjacentHTML('beforeend', createRewardsStep(rewards));
          }
          
          // Fix the step order - always ensure rewards step is before final step
          const existingRewardsIndex = stepSequence.indexOf('rewards-step');
          if (existingRewardsIndex > -1) {
            stepSequence.splice(existingRewardsIndex, 1);
          }
          
          // Then insert it before final-step
          const finalStepIndex = stepSequence.indexOf('final-step');
          if (finalStepIndex > -1) {
            stepSequence.splice(finalStepIndex, 0, 'rewards-step');
            console.log('DOMContentLoaded: Positioned rewards-step before final-step');
          } else {
            addToStepSequence('rewards-step');
          }
          
          // Update the navigation elements
          updateNavigationBar();
          updateStepListDisplay();
          
          // Initialize reward tier events
          initRewardTierEvents(rewards);
        }
      }, 300); // Close the inner setTimeout
    }
  }, 100); // Short delay for the first setTimeout
  
  // Special handling for auto mode
  if (isAutoMode && domain) {
    // Initialize stepSequence from localStorage if available
    try {
      // Wait a short time for the app to initialize other components
      setTimeout(async () => {
        // Check if we're on the final step
        if (savedStepIndex > 0 && stepSequence[savedStepIndex] === 'final-step') {
          console.log('Page loaded on final step in auto mode, regenerating summary');
          
          // Load API data from localStorage if available
          const savedData = localStorage.getItem(`apiData_${domain}`);
          if (savedData) {
            try {
              const parsedData = JSON.parse(savedData);
              // Update the stored API data
              storedApiData.mobileDetails = parsedData.mobileDetails;
              storedApiData.apiDetails = parsedData.apiDetails;
              storedApiData.loading = false;
              storedApiData.isLoading = false;
              
              // Get the template and form data
              const { template, rewards } = await loadTemplate();
              const formData = getFormData();
              
              // Re-generate the summary
              updateFinalSummaryEditorAuto(template, formData, rewards);
              console.log('Summary regenerated with saved API data');
            } catch (e) {
              console.error('Error parsing saved API data on page load', e);
            }
          } else {
            // If no saved data exists, trigger loading API data
            loadApiDataInBackground(domain);
          }
        }
      }, 500); // Give time for other initialization code to run
    } catch (error) {
      console.error('Error during page load initialization:', error);
    }
  }
});

function saveSelections() {
    localStorage.setItem('sectionSelections', JSON.stringify({
      website: document.getElementById('websiteToggle').checked,
      mobile: document.getElementById('mobileToggle').checked,
      api: document.getElementById('apiToggle').checked
    }));
    }

    ['websiteToggle', 'mobileToggle', 'apiToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSelections);
});  

function hideAllSteps() {
    stepSequence.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }  

  function generateLabeledField({ icon, labelText, tooltipText, fieldHTML }) {
    return `
      <label class="block text-lg font-semibold text-gray-800 mb-2">
        <span class="inline-flex items-center gap-2">
          ${icon} ${labelText}
          ${tooltipText ? `
            <span class="relative pointer-events-none">
              <span class="text-blue-500 cursor-pointer peer pointer-events-auto">ℹ️</span>
              <span class="absolute left-full top-1/2 ml-2 -translate-y-1/2 w-64 bg-blue-100 text-black text-sm rounded-lg shadow-lg p-3 opacity-0 peer-hover:opacity-100 transition-opacity z-10 border border-blue-300">
                ${tooltipText.replace(/\n/g, '<br>')}
              </span>
            </span>
          ` : ''}
        </span>
      </label>
      ${fieldHTML}
    `;
  }  

  // Display API results in the auto results container
  function displayAutoResults(mobileDetails, apiDetails) {
    const container = document.getElementById('autoResultsContainer');
    const content = document.getElementById('autoResultsContent');
    if (!container || !content) return;
    container.classList.remove('hidden');
    
    // Function to format a data section
    const formatSection = (title, data) => {
      if (!data) {
        return `<div><strong>${title}:</strong> <span class="text-gray-500">No data available</span></div>`;
      }
      
      // Check if this is an error
      if (data.error) {
        return `
          <div>
            <strong>${title}:</strong>
            <div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 mt-1 mb-3">
              <p class="font-medium">${data.message || 'Error fetching data'}</p>
              <p class="text-sm">${data.details || 'No details available'}</p>
            </div>
          </div>
        `;
      }
      
      // Regular data display
      return `
        <div>
          <strong>${title}:</strong>
          <pre class="bg-white p-2 rounded border mt-1 text-xs">${JSON.stringify(data, null, 2)}</pre>
        </div>
      `;
    };
    
    // Check for connection errors
    let errorNotice = '';
    if ((mobileDetails && mobileDetails.error) || (apiDetails && apiDetails.error)) {
      errorNotice = `
        <div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 mb-3">
          <p class="font-medium">⚠️ API Connection Failed</p>
          <p class="text-sm">Could not connect to the API server. Please check your network connection and ensure the API server is running.</p>
        </div>
      `;
    }
    
    // Combine all sections
    let htmlContent = errorNotice;
    
    if (mobileDetails) {
      htmlContent += formatSection("Mobile App Details", mobileDetails);
    }
    
    if (apiDetails) {
      htmlContent += formatSection("API Details", apiDetails);
    }
    
    // Update the content and show the container
    content.innerHTML = htmlContent;
    container.style.display = 'block';
  }

  // Function to restore the last step from localStorage
  async function restoreLastStep() {
    return new Promise((resolve) => {
      // Use requestAnimationFrame to ensure this runs after the current execution context
      // and after the browser has had a chance to paint
      requestAnimationFrame(async () => {
        const savedStepIndex = parseInt(localStorage.getItem('currentStepIndex'), 10);
        console.log('Attempting to restore step index:', savedStepIndex, 'from sequence:', stepSequence);
        
        // Ensure stepSequence is populated and valid
        if (!Array.isArray(stepSequence) || stepSequence.length === 0) {
          console.warn('Step sequence is empty or invalid, cannot restore step');
          resolve(false);
          return;
        }
        
        // Validate the saved step index
        const isValidStep = !isNaN(savedStepIndex) && 
                          savedStepIndex >= 0 && 
                          savedStepIndex < stepSequence.length &&
                          document.getElementById(stepSequence[savedStepIndex]);
        
        if (isValidStep) {
          console.log('Restoring saved step index:', savedStepIndex, 
                     'step ID:', stepSequence[savedStepIndex]);
          currentStepIndex = savedStepIndex;
          await showStep(stepSequence[currentStepIndex]);
          resolve(true);
        } else {
          // Default to first step if no saved step or invalid
          console.log('No valid saved step, defaulting to first step');
          currentStepIndex = 0;
          await showStep(stepSequence[0]);
          resolve(true);
        }
      });
    });
  }

  // Function to create View API Data button
  function createViewApiDataButton() {
    // Only show API Data button in auto mode AND if enabled in config
    const isAutoMode = localStorage.getItem('autoMode') === 'true';
    
    // Check if button already exists
    let viewApiButton = document.getElementById('dynamicViewApiButton');
    
    // Get the fixed navigation buttons container
    const fixedNavButtons = document.getElementById('fixedNavButtons');
    if (!fixedNavButtons) return;
    
    // The API Data button should be before the Back button
    const backButton = document.getElementById('backButtonBottom');
    if (!backButton) return;
    
    // If not in auto mode OR button is disabled in config, remove it if it exists and exit
    if (!isAutoMode || !showApiDataButton) {
      if (viewApiButton) {
        viewApiButton.remove();
      }
      return;
    }
    
    // Continue with auto mode - create button if needed
    if (!viewApiButton) {
      viewApiButton = document.createElement('button');
      viewApiButton.id = 'dynamicViewApiButton';
      
      // Insert before back button
      backButton.insertAdjacentElement('beforebegin', viewApiButton);
    }
    
    // Set button appearance based on state
    if (storedApiData.loading) {
      // Keep blue loading state
      viewApiButton.className = 'ml-2 bg-blue-400 text-white px-4 py-2 rounded hover:bg-blue-500 text-sm font-medium';
      viewApiButton.innerHTML = '<span class="inline-block animate-spin mr-1">↻</span> Loading...';
    } else if (storedApiData.error) {
      // Keep red for error state
      viewApiButton.className = 'ml-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 text-sm font-medium';
      viewApiButton.innerHTML = '⚠️ API Error';
    } else {
      // Standard button styling for normal state (matching Next button)
      viewApiButton.className = 'ml-2 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 text-sm font-medium';
      viewApiButton.innerHTML = '🔍 API Data';
    }
    
    // Helper function to check if we have any API data
    function hasApiData() {
      // Check for mobile details with actual content
      if (storedApiData.mobileDetails) {
        // Check if there are any arrays or properties with values
        for (const key in storedApiData.mobileDetails) {
          const value = storedApiData.mobileDetails[key];
          if (value && (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '')) {
            return true;
          }
        }
      }
      
      // Check for API details with actual content
      if (storedApiData.apiDetails) {
        for (const key in storedApiData.apiDetails) {
          const value = storedApiData.apiDetails[key];
          if (value && (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '')) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    // Set click handler to show popup
    viewApiButton.onclick = showApiResultsPopup;
  }
  
  // Function to display API data in popup
  function showApiResultsPopup() {
    // Create modal container if it doesn't exist
    let modal = document.getElementById('dynamicApiModal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dynamicApiModal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40';
      modal.style.display = 'flex';
      
      // Create modal content container
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-auto relative';
      
      // Create header
      const header = document.createElement('div');
      header.className = 'flex justify-between items-center mb-4';
      
      const title = document.createElement('h2');
      title.className = 'text-xl font-semibold text-gray-800';
      title.textContent = 'API Data Results';
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'text-gray-400 hover:text-gray-600 text-2xl font-bold';
      closeBtn.innerHTML = '&times;';
      closeBtn.onclick = () => { document.body.removeChild(modal); };
      
      header.appendChild(title);
      header.appendChild(closeBtn);
      
      // Create content area
      const contentArea = document.createElement('div');
      contentArea.className = 'overflow-auto';
      contentArea.id = 'dynamicApiModalContent';
      
      modalContent.appendChild(header);
      modalContent.appendChild(contentArea);
      modal.appendChild(modalContent);
      
      // Close when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
      
      document.body.appendChild(modal);
    }
    
    const contentArea = document.getElementById('dynamicApiModalContent');
    
    // Check if we're loading
    if (storedApiData.loading) {
      contentArea.innerHTML = `
        <div class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mb-4"></div>
          <p class="text-lg font-medium">Loading API Data...</p>
          <p class="text-sm text-gray-500 mt-2">This may take up to a minute to complete.</p>
        </div>
      `;
      return;
    }
    
    // Check if we have an error
    if (storedApiData.error) {
      const errorObj = storedApiData.error;
      const timestamp = errorObj.timestamp ? new Date(errorObj.timestamp).toLocaleString() : new Date().toLocaleString();
      
      contentArea.innerHTML = `
        <div class="text-center py-6">
          <div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4 text-left">
            <div class="flex items-center mb-2">
              <span class="text-2xl mr-2">⚠️</span>
              <p class="font-bold text-xl">API Error</p>
            </div>
            <p class="font-medium">${errorObj.message || 'Failed to load API data'}</p>
            <p class="text-sm mt-1">${errorObj.details || 'No detailed error information available'}</p>
            ${errorObj.errorCode ? `<p class="text-xs mt-2 font-mono">Error code: ${errorObj.errorCode}</p>` : ''}
            <p class="text-xs text-gray-600 mt-1">Time: ${timestamp}</p>
            ${errorObj.endpoint ? `<p class="text-xs text-gray-600">Endpoint: ${errorObj.endpoint}</p>` : ''}
          </div>
          <button id="retryApiButton" class="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center mx-auto">
            <span class="inline-block mr-2">↻</span> Retry API Request
          </button>
        </div>
      `;
      
      // Add retry button event listener
      setTimeout(() => {
        const retryBtn = document.getElementById('retryApiButton');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            const domain = localStorage.getItem('autoModeDomain');
            if (domain) {
              loadApiDataInBackground(domain);
            } else {
              showMessageModal("Error", "Cannot retry: No domain information available");
            }
          });
        }
      }, 0);
      return;
    }
    
    // Format data for display
    let htmlContent = '';
    
    // Format a data section helper function
    const formatSection = (title, data) => {
      if (!data) {
        return `<div class="mb-4"><strong>${title}:</strong> <span class="text-gray-500">No data available</span></div>`;
      }
      
      if (data.error) {
        return `
          <div class="mb-4">
            <strong>${title}:</strong>
            <div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 mt-1">
              <p class="font-medium">⚠️ ${data.message || 'Error fetching data'}</p>
              <p class="text-sm">${data.details || 'No details available'}</p>
              ${data.errorCode ? `<p class="text-xs mt-1 font-mono">Error code: ${data.errorCode}</p>` : ''}
              ${data.timestamp ? `<p class="text-xs text-gray-600 mt-1">Time: ${new Date(data.timestamp).toLocaleTimeString()}</p>` : ''}
            </div>
          </div>
        `;
      }
      
      return `
        <div class="mb-4">
          <strong class="text-lg text-blue-700">${title}</strong>
          <div class="mt-2">
            ${formatApiDataContent(data)}
          </div>
        </div>
      `;
    };
    
    // Format specific API data content for better display
    function formatApiDataContent(data) {
      if (Array.isArray(data)) {
        return `<ul class="list-disc pl-5 space-y-1">
          ${data.map(item => `<li>${typeof item === 'string' ? item : JSON.stringify(item)}</li>`).join('')}
        </ul>`;
      }
      
      if (typeof data === 'object' && data !== null) {
        let result = '<div class="space-y-2">';
        
        // Handle special properties with better formatting
        if (data.suggestedApi) {
          result += `<div><strong>Suggested API:</strong> <span class="text-green-600 font-medium">${data.suggestedApi}</span></div>`;
        }
        
        if (data.notes) {
          result += `<div><strong>Notes:</strong> <span>${data.notes}</span></div>`;
        }
        
        // Handle array properties with better formatting
        for (const [key, value] of Object.entries(data)) {
          if (key !== 'suggestedApi' && key !== 'notes' && key !== 'error' && key !== 'message' && key !== 'details') {
            if (Array.isArray(value) && value.length > 0) {
              result += `<div class="mt-2">
                <strong>${key} (${value.length}):</strong>
                <ul class="list-disc pl-5 space-y-1 mt-1 max-h-60 overflow-y-auto p-1">
                  ${value.map(item => `<li>${typeof item === 'string' ? item : JSON.stringify(item)}</li>`).join('')}
                </ul>
              </div>`;
            } else if (!Array.isArray(value)) {
              result += `<div><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
            }
          }
        }
        
        result += '</div>';
        return result;
      }
      
      return `<pre class="bg-gray-50 p-2 rounded border text-sm">${JSON.stringify(data, null, 2)}</pre>`;
    }
    
    // Add mobile and API details
    if (storedApiData.mobileDetails) {
      htmlContent += formatSection("Mobile App Details", storedApiData.mobileDetails);
    }
    
    if (storedApiData.apiDetails) {
      htmlContent += formatSection("API Details", storedApiData.apiDetails);
    }
    
    if (!storedApiData.mobileDetails && !storedApiData.apiDetails) {
      const domain = localStorage.getItem('autoModeDomain') || 'unknown domain';
      
      htmlContent = `
        <div class="text-center py-6">
          <div class="bg-gray-50 border-l-4 border-gray-300 text-gray-700 p-4 mb-4 text-left">
            <div class="flex items-center mb-2">
              <span class="text-2xl mr-2">ℹ️</span>
              <p class="font-semibold text-xl">No API Data Available</p>
            </div>
            <p class="mb-2">No API data was found for: <span class="font-mono">${domain}</span></p>
            <p class="text-sm">This could be because:</p>
            <ul class="list-disc ml-6 text-sm mt-1 text-gray-600">
              <li>The domain doesn't have any public APIs</li>
              <li>The API detection service couldn't find relevant information</li>
              <li>The domain format may be incorrect</li>
            </ul>
          </div>
          <button id="retryApiButton" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center mx-auto">
            <span class="inline-block mr-2">↻</span> Load API Data
          </button>
        </div>
      `;
      
      // Add retry button event listener
      setTimeout(() => {
        const retryBtn = document.getElementById('retryApiButton');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            const domain = localStorage.getItem('autoModeDomain');
            if (domain) {
              loadApiDataInBackground(domain);
            } else {
              console.error("Cannot retry: No domain found in storage");
              showMessageModal("Error", "Cannot retry API loading: No domain information available");
            }
          });
        }
      }, 0);
    }
    
    // Set content
    contentArea.innerHTML = htmlContent;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Load API button visibility config from template
    await loadConfigFromTemplate();
    
    // Check if we're in auto mode and restore if needed
    const isAutoMode = localStorage.getItem('autoMode') === 'true';
    const autoModeDomain = localStorage.getItem('autoModeDomain');
    
    if (isAutoMode && autoModeDomain) {
      try {
        // Set up UI for auto mode
        document.getElementById('setupAuto').checked = true;
        document.getElementById('setupManual').checked = false;
        document.getElementById('autoControls').style.display = 'block';
        document.getElementById('manualControls').style.display = 'none';
        
        // Set global setup mode
        setupMode = 'auto';
        
        const websiteInput = document.getElementById('websiteUrl');
        if (websiteInput) {
          websiteInput.value = autoModeDomain;
        }
        
        // Initialize auto mode
        await initializeAutoMode();
        
        // Restore the last step
        const savedIndex = parseInt(localStorage.getItem('currentStepIndex') || '0', 10);
        if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < stepSequence.length) {
          currentStepIndex = savedIndex;
        }
        
        hideAllSteps();
        showStep(stepSequence[currentStepIndex]);
        updateNavigationBar();
        updateButtons();
        updateStepListDisplay();
        
        // Show navigation UI
        document.getElementById('introImageContainer')?.classList.add('hidden');
        document.getElementById('stepTracker')?.classList.remove('hidden');
        document.getElementById('fixedNavButtons')?.classList.remove('hidden');
        document.getElementById('resetButton')?.classList.remove('hidden');

        
        // Show navigation buttons
        ['backButton', 'nextButton'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.classList.remove('hidden');
        });
      } catch (err) {
        console.error('Error restoring auto mode:', err);
        // Fall back to manual mode if there's an error
        localStorage.removeItem('autoMode');
        localStorage.removeItem('autoModeDomain');
        document.getElementById('setupManual').click();
      }
    } else {
      // Restore form state if available
      loadFormState();
    }
    
    const autoRadio      = document.getElementById('setupAuto');
    const manualRadio    = document.getElementById('setupManual');
    const autoControls   = document.getElementById('autoControls');
    const manualControls = document.getElementById('manualControls');
    const websiteInput   = document.getElementById('websiteUrl');
    const autoStartBtn   = document.getElementById('autoStartButton');
    const manualStartBtn = document.getElementById('manualStartButton');
    
    if (manualStartBtn) {
      console.log('manualStartButton found, attaching event');
    } else {
      console.error('manualStartButton not found in DOM');
    }

    function updateMode() {
      const isAuto = autoRadio.checked;
      console.log('Switching mode. Auto:', isAuto);
      autoControls.style.display   = isAuto ? 'block' : 'none';
      manualControls.style.display = isAuto ? 'none'  : 'block';
      websiteInput.required = isAuto;
      if (!isAuto) websiteInput.value = '';
    }

    // Attach listeners for radio buttons
    autoRadio.addEventListener('change', updateMode);
    manualRadio.addEventListener('change', updateMode);
    updateMode(); // Ensure correct mode at load

    // Debug for button events
    if (autoStartBtn) {
      console.log('autoStartButton found, attaching event');
    } else {
      console.error('autoStartButton not found in DOM');
    }

    autoRadio.addEventListener('change', updateMode);
    manualRadio.addEventListener('change', updateMode);
    updateMode(); // initial call

    autoStartBtn.addEventListener('click', async (e) => {
      setupMode = 'auto';
      e.preventDefault();
      const domain = extractDomain(websiteInput.value.trim());
      if (!isValidDomain(domain)) {
        showMessageModal("URL/Domain", "Please enter a valid URL or domain (e.g. https://example.com or example.com)");
        return;
      }
      autoStartBtn.disabled = true;
      autoStartBtn.textContent = "Loading...";
      function isValidDomain(domain) {
        // Must have at least one dot and only allowed characters
        const domainPattern = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,}$/;
        return domainPattern.test(domain);
      }
  
      function extractDomain(input) {
        try {
          if (input.startsWith('http://') || input.startsWith('https://')) {
            return new URL(input).hostname;
          }
          return input.replace(/^https?:\/\//, '').split('/')[0];
        } catch {
          return input.trim();
        }
      }
      try {
        // Save auto mode state
        localStorage.setItem('autoMode', 'true');
        localStorage.setItem('autoModeDomain', domain);
        localStorage.setItem('wizardStarted', 'true'); // Set flag that wizard has started
        
        // Backend fetches with improved error handling
        console.log("Domain being sent:", domain);
        
        // Show loading indicator
        const container = document.getElementById('autoResultsContainer');
        const content = document.getElementById('autoResultsContent');
        
        if (container && content) {
          container.classList.remove('hidden');
          container.style.display = 'block';
          content.innerHTML = `
            <div class="text-center py-4">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mb-2"></div>
              <p>Loading data from API...</p>
              <p class="text-xs text-gray-500">This may take up to a minute</p>
            </div>
          `;
        }
        
        // Note: API calls are now moved to the rewards step for better UX
        console.log("Domain saved for later API calls:", domain);
        
        // Use placeholder data for now - actual API calls will happen in rewards step
        let mobileDetails = { message: "API data will be loaded in the rewards step" };
        let apiDetails = { message: "API data will be loaded in the rewards step" };
        
        // Display results or errors
        displayAutoResults(mobileDetails, apiDetails);
        
        // Continue with initialization even if API calls failed
        console.log("Continuing with app initialization despite API status");

        // Initialize auto mode steps
        await initializeAutoMode();
        // Restore the last step or show the first step
        const savedIndex = parseInt(localStorage.getItem('currentStepIndex') || '0', 10);
        currentStepIndex = (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < stepSequence.length)
                        ? savedIndex
                        : 0;
        
        hideAllSteps();
        showStep(stepSequence[currentStepIndex]);
        updateNavigationBar();
        updateButtons();
        updateStepListDisplay();
        // Hide bug image, show navigation buttons
        const introImageContainer = document.getElementById('introImageContainer');
        const stepTracker = document.getElementById('stepTracker');
        if (introImageContainer) introImageContainer.classList.add('hidden');
        if (stepTracker) stepTracker.classList.remove('hidden');
        document.getElementById('fixedNavButtons')?.classList.remove('hidden');
        // Show top nav buttons (back, next, jump)
        [
          document.getElementById('backButton'),
          document.getElementById('nextButton')
        ].forEach(btn => btn && btn.classList.remove('hidden'));
        // Always hide jumpToEndButton in auto mode
        document.getElementById('jumpToEndButton')?.classList.add('hidden');
        // Show reset button, hide add web/mobile/api buttons at bottom if auto mode
        document.getElementById('resetButton')?.classList.remove('hidden');
        if (setupMode === 'auto') {
          document.getElementById('addWebsiteBtn')?.classList.add('hidden');
          document.getElementById('addMobileBtn')?.classList.add('hidden');
          document.getElementById('addApiBtn')?.classList.add('hidden');
        }
      } catch (err) {
        console.error("Auto mode error:", err);
        showMessageModal("Error", "Failed to start wizard: " + err.message);
      } finally {
        autoStartBtn.disabled = false;
        autoStartBtn.textContent = "⏵";
      }
    });

    // Manual start button event listener
    manualStartBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      // Set flag that wizard has started
      localStorage.setItem('wizardStarted', 'true');
      const success = await manualStart();
      if (!success) return;
      
      // Generate steps if not already done
      if (!stepsGenerated) {
        const stepsSuccess = generateSteps();
        if (stepsSuccess) {
          stepsGenerated = true;
          if (builderContainer) builderContainer.classList.add('hidden');
          
          // Attach save listeners if the function exists
          if (typeof attachSaveListeners === 'function') {
            attachSaveListeners();
          } else {
            console.warn('attachSaveListeners function is not defined');
          }
        }
      }
      await generateSteps();
      // Hide setup section after manual flow
      document.getElementById('builderContainer').classList.add('hidden');
    });
  
    // ————————————————— Existing Wizard Startup Code —————————————————
    const savedSelections = JSON.parse(localStorage.getItem('sectionSelections') || '{}');
    const savedCounts     = JSON.parse(localStorage.getItem('sectionCounts')   || '{}');
    const hasSavedCounts  = !!(savedCounts.website || savedCounts.mobile || savedCounts.api);
  
    // Restore toggles
    document.getElementById('websiteToggle').checked = !!savedSelections.website;
    document.getElementById('mobileToggle') .checked = !!savedSelections.mobile;
    document.getElementById('apiToggle')    .checked = !!savedSelections.api;
  
    websiteSelected = !!savedSelections.website;
    mobileSelected  = !!savedSelections.mobile;
    apiSelected     = !!savedSelections.api;
  
    const container   = document.getElementById('stepContainer');
    const nextButton  = document.getElementById('nextButton');
    const backButton  = document.getElementById('backButton');
  
    if (!container || !nextButton || !backButton) {
      console.error('Required DOM elements are missing');
      return;
    }
  
    // Reset
    container.innerHTML   = '';
    currentStepIndex      = 0;
    nextButton.disabled   = true;
    nextButton.classList.add('opacity-50');
    backButton.disabled   = true;
    backButton.classList.add('opacity-50');
  
    if (websiteSelected || mobileSelected || apiSelected) {
      let success = false;
  
      if (hasSavedCounts) {
        // Resume
        websiteCounter = 1; mobileCounter = 1; apiCounter = 1;
        for (let i = 0; i < (savedCounts.website || 0); i++) addWebsiteSection();
        for (let i = 0; i < (savedCounts.mobile  || 0); i++) addMobileSection();
        for (let i = 0; i < (savedCounts.api     || 0); i++) addApiSection();
        
        // First, ensure the final step exists so we can later position rewards before it
        ensureFinalStepExists();
        
        // Make sure to add rewards step before final step when resuming
        const rewardsStep = document.getElementById('rewards-step');
        if (!rewardsStep) {
          // Add rewards step if it doesn't exist yet
          loadTemplate().then(({ rewards }) => {
            document.getElementById('stepContainer').insertAdjacentHTML('beforeend', createRewardsStep(rewards));
            initRewardTierEvents(rewards);
            
            // Fix the step order - remove rewards-step if it's in the sequence already
            const rewardsIndex = stepSequence.indexOf('rewards-step');
            if (rewardsIndex > -1) {
              stepSequence.splice(rewardsIndex, 1);
            }
            
            // Find final step and insert rewards step before it
            const finalIndex = stepSequence.indexOf('final-step');
            if (finalIndex > -1) {
              stepSequence.splice(finalIndex, 0, 'rewards-step');
              console.log('Inserted rewards-step before final-step in sequence');
            } else {
              // If final step isn't in the sequence yet, just add rewards step
              addToStepSequence('rewards-step');
            }
            
            // Force update the navigation to show the correct order
            updateNavigationBar();
            updateStepListDisplay();
          });
        } else {
          // If rewards step exists in DOM but might be in wrong position
          // First remove it from sequence if it exists
          const rewardsIndex = stepSequence.indexOf('rewards-step');
          if (rewardsIndex > -1) {
            stepSequence.splice(rewardsIndex, 1);
          }
          
          // Then insert it before final-step
          const finalIndex = stepSequence.indexOf('final-step');
          if (finalIndex > -1) {
            stepSequence.splice(finalIndex, 0, 'rewards-step');
            console.log('Reordered rewards-step to be before final-step');
          } else {
            // If final step isn't in sequence, just add rewards step
            addToStepSequence('rewards-step'); 
          }
          
          // Update the UI
          updateNavigationBar();
          updateStepListDisplay();
        }
        
        success = true;
      } else {
        // Fresh load
        websiteCounter = 1; mobileCounter = 1; apiCounter = 1;
        success = generateSteps();
      }
  
      if (success) {
        // Hide the builder container now that wizard has started
        builderContainer?.classList.add('hidden');
        
        // Show navigation
        document.getElementById('navButtons')?.classList.remove('hidden');
        document.getElementById('stepTracker')?.classList.remove('hidden');
        document.getElementById('introImageContainer')?.classList.add('hidden');

        ['resetButton','backButton','nextButton'].forEach(id => {
          document.getElementById(id)?.classList.remove('hidden');
        });

        loadFormState();
        attachSaveListeners();

        // Add a small delay to ensure DOM is fully updated
        setTimeout(() => {
          // Restore last step after ensuring stepSequence is populated
          const savedIndex = parseInt(localStorage.getItem('currentStepIndex'), 10);
          currentStepIndex = (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < stepSequence.length)
                            ? savedIndex
                            : 0;

          console.log('Restoring to step index:', currentStepIndex, 
                     'Step ID:', stepSequence[currentStepIndex]);
          
          // Show the step directly without going through showStep to prevent recursion
          const stepToShow = stepSequence[currentStepIndex];
          const stepElement = document.getElementById(stepToShow);
          if (stepElement) {
            hideAllSteps();
            stepElement.classList.remove('hidden');
            updateButtons();
            updateStepListDisplay();
            updateNavigationBar();
            stepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            // Fallback to first step if the saved step doesn't exist
            console.warn('Saved step not found, defaulting to first step');
            currentStepIndex = 0;
            showStep(stepSequence[0]);
          }
        }, 100); // Small delay to ensure DOM is ready
      }
    }
    // ————————————————— End Wizard Startup Code ————————————————
  });  

// script.js
document.addEventListener('trix-initialize', (e) => {
  const toolbar   = e.target.toolbarElement;
  const fileGroup = toolbar.querySelector('[data-trix-button-group="file-tools"]');
  if (!fileGroup) return;

  // remove any old copy-button so we don't double-up
  const old = fileGroup.querySelector('#copyButton');
  if (old) old.remove();

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.id        = 'copyButton';
  btn.title     = 'Copy to Clipboard';
  btn.className = 'trix-button copy-button';
  btn.innerHTML = '📋 Copy';        // emoji + text
  btn.addEventListener('click', copyFinalSummary);

  fileGroup.appendChild(btn);
});

function toggleSection() {
    const websiteToggle = document.getElementById('websiteToggle');
    const mobileToggle = document.getElementById('mobileToggle');
    const apiToggle = document.getElementById('apiToggle');
    const nextButton = document.getElementById('nextButton');
    const autoStartButton = document.getElementById('autoStartButton');
    const manualStartButton = document.getElementById('manualStartButton');

    // Check if required elements exist
    if (!websiteToggle || !mobileToggle || !apiToggle) {
        console.error('Required toggle elements not found');
        return;
    }

    // Update global selection variables
    websiteSelected = websiteToggle.checked;
    mobileSelected = mobileToggle.checked;
    apiSelected = apiToggle.checked;

    const isSectionSelected = websiteSelected || mobileSelected || apiSelected;

    // Update Next button state if it exists
    if (nextButton) {
        nextButton.disabled = !isSectionSelected;
        nextButton.classList.toggle('opacity-50', !isSectionSelected);

        // If a section is selected, update the onclick handler
        if (isSectionSelected) {
            nextButton.onclick = () => {
                if (!stepsGenerated) {
                    const success = generateSteps();
                    if (success) {
                        nextButton.onclick = goToNextStep;
                    }
                } else {
                    goToNextStep();
                }
            };
        } else {
            nextButton.onclick = null;
        }
    }


    // Update start buttons if they exist
    if (autoStartButton) autoStartButton.disabled = !isSectionSelected;
    if (manualStartButton) manualStartButton.disabled = !isSectionSelected;

    console.log(`Section selected: ${isSectionSelected}`);
}

// Event Delegation for all interactive elements
document.addEventListener('DOMContentLoaded', () => {
  // Handle all button clicks
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    // Prevent default for form submissions
    if (button.tagName === 'BUTTON') {
      e.preventDefault();
    }

    // Execute the corresponding function
    switch (action) {
      case 'toggleSection':
        toggleSection(button.dataset.section);
        break;
      case 'manualStart':
        manualStart();
        break;
      case 'resetWizard':
        resetWizard();
        break;
      case 'deleteCurrentSection':
        deleteCurrentSection();
        break;
      case 'insertWebsiteSectionInOrder':
        insertWebsiteSectionInOrder();
        break;
      case 'insertMobileSectionInOrder':
        insertMobileSectionInOrder();
        break;
      case 'insertApiSectionInOrder':
        insertApiSectionInOrder();
        break;
      case 'goToPreviousStep':
        goToPreviousStep();
        break;
      case 'goToNextStep':
        goToNextStep();
        break;
    }
  });

  // Handle checkbox changes
  document.addEventListener('change', (e) => {
    const input = e.target;
    if (input.dataset.action === 'toggleSection') {
      toggleSection(input.dataset.section);
    }
  });
});

// Function to handle manual start
async function manualStart() {
  setupMode = 'manual';
  const website = document.getElementById('websiteToggle')?.checked || false;
  const mobile = document.getElementById('mobileToggle')?.checked || false;
  const api = document.getElementById('apiToggle')?.checked || false;
  
  if (!website && !mobile && !api) {
    showMessageModal("Selection Required", "Please select at least one section to test.");
    return false;
  }
  
  // Update global selection variables
  websiteSelected = website;
  mobileSelected = mobile;
  apiSelected = api;
  
  // Generate steps if not already done
  if (!stepsGenerated) {
    const stepsSuccess = generateSteps();
    if (stepsSuccess) {
      stepsGenerated = true;
      if (builderContainer) builderContainer.classList.add('hidden');
      
      // Attach save listeners if the function exists
      if (typeof attachSaveListeners === 'function') {
        attachSaveListeners();
      } else {
        console.warn('attachSaveListeners function is not defined');
      }
    }
  }
  
  return true;
}

// Initialize auto mode steps
async function initializeAutoMode() {
  document.getElementById('builderContainer').classList.add('hidden');
  const stepContainer = document.getElementById('stepContainer');
  stepContainer.innerHTML = '';
  stepSequence = [];
  currentStepIndex = 0;
  setupMode = 'auto'; // Set setup mode to auto to hide add buttons
  
  try {
    // Load rewards data first
    const { rewards } = await loadTemplate();
    
    // Add rewards step
    stepContainer.insertAdjacentHTML('beforeend', createRewardsStep(rewards));
    stepSequence.push('rewards-step');
    
    // Add final summary page
    ensureFinalStepExists();
    stepsGenerated = true;
    
    // Show navigation elements
    document.getElementById('navButtons')?.classList.remove('hidden');
    document.getElementById('stepTracker')?.classList.remove('hidden');
    
    // Initialize reward tier events after a small delay to ensure DOM is ready
    setTimeout(async () => {
      // Ensure rewards step exists in the DOM and sequence
      let rewardsStep = document.getElementById('rewards-step');
      
      // If rewards step doesn't exist, create it (similar to generateSteps)
      if (!rewardsStep) {
        const { rewards } = await loadTemplate();
        const rewardsHTML = createRewardsStep(rewards);
        document.getElementById('stepContainer').insertAdjacentHTML('beforeend', rewardsHTML);
        rewardsStep = document.getElementById('rewards-step');
        
        // Initialize reward tier events
        initRewardTierEvents(rewards);
        
        // Add to step sequence if not already there
        if (!stepSequence.includes('rewards-step')) {
          addToStepSequence('rewards-step');
        }
      }
      
      // First ensure rewards step is fully initialized with events
      const { rewards } = await loadTemplate();
      initRewardTierEvents(rewards);
      
      // Load any saved form state including rewards
      await loadFormState();
      
      // Restore selected reward tier and description if they exist
      const savedTier = localStorage.getItem('selectedRewardTier');
      const savedDescription = localStorage.getItem('rewardsDescription');

      if (savedTier && rewardsStep) {
        const savedRadio = document.querySelector(`input[name="rewardTier"][value="${savedTier}"]`);
        if (savedRadio) {
          // First ensure the radio is checked
          savedRadio.checked = true;
          
          // Force a reflow to ensure the DOM is updated
          void savedRadio.offsetHeight;
          
          // Manually call updateDetails to ensure UI updates
          const updateDetails = window.updateRewardDetails; // This should be defined in initRewardTierEvents
          if (typeof updateDetails === 'function') {
            updateDetails(savedTier);
          } else {
            // Fallback to dispatching change event if updateDetails isn't available
            const changeEvent = new Event('change', { bubbles: true });
            savedRadio.dispatchEvent(changeEvent);
          }
          
          // If we have a saved description, update the editor
          if (savedDescription) {
            const rewardsInput = document.getElementById('rewardsDescription');
            const rewardsEditor = document.querySelector('trix-editor[input="rewardsDescription"]');
            
            if (rewardsInput && rewardsEditor) {
              rewardsInput.value = savedDescription;
              rewardsEditor.editor.loadHTML(savedDescription);
              
              // Force update the form state
              saveFormState('rewardsDescription', savedDescription);
            }
          }
        }
      }
      
      // Ensure final step exists and is in the DOM
      if (!document.getElementById('final-step')) {
        const finalStepHTML = createFinalStep('final-step');
        document.getElementById('stepContainer').insertAdjacentHTML('beforeend', finalStepHTML);
        if (!stepSequence.includes('final-step')) {
          stepSequence.push('final-step');
        }
      }
      
      // Use restoreLastStep to determine which step to show (rewards, final, etc.)
      await restoreLastStep();
      
      // Update UI
      updateNavigationBar();
      updateButtons();
    }, 300); // Increased delay to ensure DOM is ready
    
    return true;
  } catch (error) {
    console.error('Error initializing auto mode:', error);
    return false;
  } finally {
    document.getElementById('introImageContainer')?.classList.add('hidden');
    document.getElementById('fixedNavButtons')?.classList.remove('hidden');
    document.getElementById('resetButton')?.classList.remove('hidden');
    
    // Show navigation buttons
    ['backButton', 'nextButton'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('hidden');
    });
    
    // Hide jump button in auto mode
    document.getElementById('jumpToEndButton')?.classList.add('hidden');
  }
}

// Get references to elements
const startWizardButton = document.getElementById('startWizardButton');
const builderContainer = document.getElementById('builderContainer');

if (startWizardButton) {
  startWizardButton.onclick = () => {
    if (!stepsGenerated) {
      const success = generateSteps();
      if (success) {
        stepsGenerated = true;
        if (builderContainer) builderContainer.classList.add('hidden');
        
        // Attach save listeners if the function exists
        if (typeof attachSaveListeners === 'function') {
          attachSaveListeners();
        } else {
          console.warn('attachSaveListeners function is not defined');
        }
      }
    }
  };
}

// Utility function to ensure final-step exists
function ensureFinalStepExists() {
    const finalStepId = 'final-step';
    if (!stepSequence.includes(finalStepId)) {
    const finalStepHTML = createFinalStep(finalStepId);
    document.getElementById('stepContainer')?.insertAdjacentHTML('beforeend', finalStepHTML);
      stepSequence.push(finalStepId);
      console.log('Final step inserted');
    }
}

function insertSectionInOrder({
  stepIds,                  // array of step IDs (e.g. ['web-1-step-1', 'web-1-step-2'])
  createHTML,               // function that returns the full HTML string
  insertBeforePrefix,       // e.g. 'mobile-', 'api-', or 'final-step'
  updateLastIndexCallback,  // function to update last indexes (e.g. lastApiIndex)
  postInsertCallback        // optional function to run after DOM insertion
}) {
  let insertAt = stepSequence.findIndex(id => id.startsWith(insertBeforePrefix));
  if (insertAt === -1) insertAt = stepSequence.length;

  const isAtRewardsStep = currentStepIndex === stepSequence.length - 2;
  if (isAtRewardsStep) {
      wasAtRewardsStepWhenAddingNew = true;
      newSectionLastStepIndex = insertAt + stepIds.length - 1;
  } else {
      wasAtRewardsStepWhenAddingNew = false;
  }

  const insertAfterId = stepSequence[insertAt - 1] || null;

  if (insertAfterId) {
      const insertAfterElement = document.getElementById(insertAfterId);
      if (!insertAfterElement) {
          console.error('Could not find element to insert after:', insertAfterId);
          return;
      }

      const tempWrapper = document.createElement('div');
      tempWrapper.innerHTML = createHTML();

      let lastInserted = insertAfterElement;
      Array.from(tempWrapper.children).forEach(el => {
          lastInserted.after(el);
          lastInserted = el;
      });
  } else {
      const firstElement = document.getElementById(stepSequence[0]);
      if (!firstElement) {
          console.error('No valid step to insert before');
          return;
      }

      const tempWrapper = document.createElement('div');
      tempWrapper.innerHTML = createHTML();

      Array.from(tempWrapper.children).reverse().forEach(el => {
          firstElement.before(el);
      });
  }

  // Update step sequence and related state
  stepSequence.splice(insertAt, 0, ...stepIds);
  updateLastIndexCallback(insertAt);
  currentStepIndex = insertAt;
  localStorage.setItem('currentStepIndex', currentStepIndex);

  // Show new step and update UI
  showStep(stepIds[0]);
  updateStepListDisplay();
  updateNavigationBar();
  updateButtons();
  attachSaveListeners();
  saveSectionCounts();

  // Run post-insert logic if provided (e.g. attach event listeners)
  if (typeof postInsertCallback === 'function') {
      postInsertCallback();
  }
}

function findNextExistingPrefix(prefixes) {
    for (const prefix of prefixes) {
        const match = stepSequence.find(id => id.startsWith(prefix));
        if (match) return prefix;
    }
    return 'rewards-step';  // fallback
}

function addWebsiteSection() {
  const container = document.getElementById('stepContainer');
  const websiteNumber = websiteCounter++;

  const stepId = `web-${websiteNumber}`; // Simplified ID without step suffix

  // Insert the consolidated web step HTML
  container.insertAdjacentHTML('beforeend', createWebSection(stepId));

  // Use addToStepSequence to add the step and log it
  addToStepSequence(stepId);

  // Track last website step index
  lastWebsiteIndex = stepSequence.length - 1;
}

function insertWebsiteSectionInOrder() {
  const websiteNumber = websiteCounter++;

  const stepId = `web-${websiteNumber}`; // Simplified ID without step suffix
  const newStepIds = [stepId];

  const insertBeforePrefix = findNextExistingPrefix(['mobile-', 'api-', 'rewards-step']);

  insertSectionInOrder({
    stepIds: newStepIds,
    insertBeforePrefix,
    createHTML: () => createWebSection(stepId),
    updateLastIndexCallback: (insertAt) => {
      lastWebsiteIndex = insertAt + newStepIds.length - 1;
      lastMobileIndex += newStepIds.length;
      lastApiIndex += newStepIds.length;
    }
  });

  console.log('Inserted Website section using new single-step layout');
}

function addMobileSection() {
  const container = document.getElementById('stepContainer');
  const mobileNumber = mobileCounter++;
  const stepId = `mobile-${mobileNumber}`; // Simplified ID without step suffix

  // Insert HTML from your createMobileSection
  container.insertAdjacentHTML('beforeend', createMobileSection(stepId));

  // Use addToStepSequence to add the step and log it
  addToStepSequence(stepId);

  // Important: Add this line AFTER inserting HTML
  attachMobileVersionToggle(stepId);

  // Track last mobile step
  lastMobileIndex = stepSequence.length - 1;
}

function attachMobileVersionListeners(id) {
  const radios = document.getElementsByName(`mobileVersionOption-${id}`);
  const textbox = document.getElementById(`mobileAppVersion-${id}`);

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      const selected = radio.value;
      localStorage.setItem(`mobileVersionOption-${id}`, selected);
      if (selected === 'specific') {
        textbox.classList.remove('hidden');
      } else {
        textbox.classList.add('hidden');
      }
    });
  });

  textbox.addEventListener('input', () => {
    localStorage.setItem(`mobileAppVersion-${id}`, textbox.value);
  });
}

function insertMobileSectionInOrder() {
  const mobileNumber = mobileCounter++;
  const stepId = `mobile-${mobileNumber}`; // Simplified ID without step suffix
  const newStepIds = [stepId];

  insertSectionInOrder({
    stepIds: newStepIds,
    createHTML: () => createMobileSection(stepId),
    insertBeforePrefix: findNextExistingPrefix(['api-', 'rewards-step', 'final-step']),
    updateLastIndexCallback: (insertAt) => {
      lastMobileIndex = insertAt + newStepIds.length - 1;
      lastApiIndex += newStepIds.length;
    }
  });

  // Attach radio/text listeners now that the DOM is updated
  attachMobileVersionListeners(stepId);
}

// API section generation
function addApiSection() {
  const container = document.getElementById('stepContainer');
  const apiNumber = apiCounter++;

  const stepId = `api-${apiNumber}`; // Simplified ID without step suffix
  container.insertAdjacentHTML('beforeend', createApiSection(stepId));

  // Use addToStepSequence to add the step and log it
  addToStepSequence(stepId);

  // Track last API step
  lastApiIndex = stepSequence.length - 1;
}

function insertApiSectionInOrder() {
  const apiNumber = apiCounter++;

  const stepId = `api-${apiNumber}`; // Simplified ID without step suffix
  const newStepIds = [stepId];

  insertSectionInOrder({
    stepIds: newStepIds,
    createHTML: () => createApiSection(stepId),
    insertBeforePrefix: findNextExistingPrefix(['rewards-step', 'final-step']),
    updateLastIndexCallback: (insertAt) => {
      lastApiIndex = insertAt;
    }
  });
}

  function initRewardTierEvents(rewardsData) {
    console.log('Initializing reward tier events...');
    const radios = document.querySelectorAll('input[name="rewardTier"]');
    const detailsBox = document.getElementById('rewardDetails');
    const copyButton = document.getElementById('copyRewardBtn');
  
    if (!radios.length || !detailsBox || !rewardsData) {
      console.warn('Missing required elements or rewards data');
      return;
    }
    
    // Make updateDetails available globally for programmatic updates
    window.updateRewardDetails = updateDetails;
  
    const examples = rewardsData.examples;
    const definitions = rewardsData.definitions;
    const intro = rewardsData.intro;
    const outro = rewardsData.outro;
    const tiers = rewardsData.tiers;
  
    // Function to update UI when a tier is selected
    function updateDetails(tierKey) {
      console.log('Updating details for tier:', tierKey);
      const tier = tiers[tierKey];
      if (!tier) {
        console.warn('Tier not found:', tierKey);
        return;
      }
  
      // Highlight selected card
      document.querySelectorAll('label.reward-tier-card').forEach(label => {
        label.classList.remove('selected');
      });
      
      const selectedCard = document.querySelector(`input[name="rewardTier"][value="${tierKey}"]`)?.closest('label');
      if (selectedCard) {
        selectedCard.classList.add('selected');
      }
  
      // Build the rewards breakdown HTML
      // Build the rewards breakdown HTML with proper spacing
      const levelOutputs = [];
      
      for (const level of ['critical', 'high', 'medium', 'low']) {
        const amount = tier.levels[level];
        const definition = definitions[level];
        const example = examples[level];

        if (amount) {
          // Check if example already starts with "Examples:" to avoid duplication
          const exampleText = example.startsWith('Examples:') ? example : `Examples: ${example}`;
          levelOutputs.push(`<strong>${capitalize(level)}: ${amount} – ${definition}</strong><br>${exampleText}`);
        }
      }
      
      // Join with single line breaks between levels
      const breakdownHTML = levelOutputs.join('<br><br>');
      
      // Create the final HTML with correct spacing
      const fullHTML = `${intro}

${breakdownHTML}

${outro}`;
  
      // Update the details box
      detailsBox.innerHTML = fullHTML;
      detailsBox.classList.remove('hidden');
      
      // Show the copy button
      if (copyButton) {
        copyButton.classList.remove('hidden');
        copyButton.setAttribute('data-tier', tierKey);
      }
  
      // Save the selected tier and update form state
      localStorage.setItem('selectedRewardTier', tierKey);
      saveFormState('rewardsDescription', fullHTML);
      
      // Update the Trix editor if it exists
      const rewardsInput = document.getElementById('rewardsDescription');
      const rewardsEditor = document.querySelector('trix-editor[input="rewardsDescription"]');
      
      if (rewardsInput && rewardsEditor) {
        rewardsInput.value = fullHTML;
        rewardsEditor.editor.loadHTML(fullHTML);
      }
      
      console.log('Rewards UI updated for tier:', tierKey);
    }
    
    // Restore saved tier if exists
    const savedTier = localStorage.getItem('selectedRewardTier');
    if (savedTier) {
      console.log('Found saved tier:', savedTier);
      const savedRadio = document.querySelector(`input[name="rewardTier"][value="${savedTier}"]`);
      if (savedRadio) {
        savedRadio.checked = true;
        // Update UI for the selected tier
        updateDetails(savedTier);
      }
    }
  
    function capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
  
    radios.forEach(radio => {
      radio.addEventListener('change', function () {
        const selected = this.value;
        localStorage.setItem('selectedRewardTier', selected);
        updateDetails(selected);
      });
    });
  
    if (savedTier) {
      updateDetails(savedTier);
    }
  }  
  
  
  function createRewardsStep(rewardsData) {
    if (!rewardsData || !rewardsData.tiers) return '<div>Error loading reward tiers.</div>';
  
    const tiers = rewardsData.tiers;
  
    const tierHTML = Object.entries(tiers).map(([key, tier]) => {
      const levels = tier.levels;
  
      const levelList = Object.entries(levels)
        .filter(([_, val]) => val && val.trim() !== "")
        .map(([severity, amount]) => {
          const label = severity.charAt(0).toUpperCase() + severity.slice(1);
          return `<li>${label}: ${amount}</li>`;
        }).join('');
  
      return `
        <label class="reward-tier-card block border rounded-md p-4 mb-4 cursor-pointer transition-all duration-200" data-tier="${key}">
          <div class="flex items-start gap-3">
            <input type="radio" name="rewardTier" value="${key}" class="mt-1">
            <div class="w-full">
              <strong class="text-gray-800 text-base">${tier.title}</strong>
              <div class="mt-2 flex flex-col md:flex-row gap-4">
                <ul class="list-disc list-inside text-sm text-gray-700 md:basis-[35%] md:shrink-0">
                  ${levelList}
                </ul>
                <p class="text-sm text-gray-600 md:basis-[65%]">
                  <strong>What to Expect:</strong> ${tier.description}
                </p>
              </div>
            </div>
          </div>
        </label>
      `;
    }).join('');
  
    return `
      <div id="rewards-step" class="question-step min-h-[200px] hidden">
        <div class="flex items-center gap-2 mb-1">
          <label class="text-lg font-semibold text-gray-800">
            💵 Reward Tiers
          </label>
          <div class="relative">
            <span class="text-blue-500 cursor-pointer text-sm group">
              ℹ️
              <span class="absolute left-full top-1/2 ml-2 -translate-y-1/2 w-72 bg-blue-100 text-black text-sm rounded-lg shadow-lg p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 border border-blue-300">
                A clear reward structure helps researchers understand the value of different findings and incentivises quality reports.<br><br>
                <strong>Consider:</strong><br>
                • Program budget<br>
                • Asset criticality<br>
                • Vulnerability impact<br>
                • Industry standards<br>
                • Report quality
              </span>
            </span>
          </div>
        </div>
  
        <p class="text-sm text-gray-600 mb-4">Choose a tier or write your own reward structure.</p>
  
        <div id="rewardTierCards">${tierHTML}</div>
  
        <p class="text-sm text-gray-600 mt-4 italic">
          <strong>Note:</strong> These ranges reflect industry averages across all severity levels. Actual bounties should be tailored to your organization's specific security needs, risk profile, and budget.
        </p>

        <div id="rewardDetails" class="mt-4 p-3 bg-blue-50 rounded-md hidden" style="display:none;"></div>

      </div>
    `;
  }  
  

  function createFinalStep(id) {
    return `
    <div id="${id}" class="question-step min-h-[200px] hidden">
        <div class="flex items-center gap-2 mb-4">
            <h2 class="text-xl font-bold text-gray-800">📄 Review Your Program Scope</h2>
            <div class="relative group">
                <span class="text-blue-500 cursor-pointer text-sm" tabindex="0">ℹ️</span>
                <div class="absolute left-full top-1/2 ml-2 -translate-y-1/2 w-80 bg-blue-100 text-black text-sm rounded-lg shadow-lg p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 border border-blue-300 whitespace-pre-line">
                    You can edit the summary text directly.  However, if you delete any of the following lines, the system will not be able to auto-fill those sections:
                    --START IN-SCOPE--
                    --END IN-SCOPE--
                    --START REWARDS--
                    --END REWARDS--
                </div>
            </div>
        </div>

        <!-- Hidden input linked to Trix -->
        <input type="hidden" id="${id}-input" />

        <!-- Trix editor -->
        <trix-editor
            id="finalSummaryContent"
            input="${id}-input"
            class="trix-content block shadow rounded-md border outline-none px-3 py-2 mt-2 w-full border-gray-400 focus:outline-blue-600 min-h-[200px]"
        ></trix-editor>
    </div>`;
}

function copyFinalSummary() {
    const content = document.getElementById('finalSummaryContent');
    if (!content) return;
  
    // Get the rendered HTML
    let html = content.innerHTML;
  
    // Strip out marker lines like --START REWARDS-- and --END IN-SCOPE--
    html = html.replace(/--START [\w-]+--/g, '');
    html = html.replace(/--END [\w-]+--/g, '');
  
    // Use a temp div to copy cleaned HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);
  
    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  
    try {
      document.execCommand('copy');
      showMessageModal("Copied!", "Formatted content copied to clipboard.");
    } catch (err) {
      console.error('Copy failed:', err);
    }
  
    document.body.removeChild(tempDiv);
  }  

// Generate the steps after the tickbox selection
let isGenerating = false;
async function generateSteps() {
    if (isGenerating) {
        console.log('generateSteps already in progress, skipping duplicate call');
        return true;
    }
    
    isGenerating = true;
    try {
        console.log('Generating steps based on selection');
        console.trace('generateSteps called from:');
    
        // Robust element retrieval with fallback
        const stepContainer = document.getElementById('stepContainer');

        // Validate critical elements
        if (!stepContainer) {
            console.error('Step container not found');
            return false;
        }

        // Reset all state before generating new steps
        stepsGenerated = false;
        stepSequence = [];
        currentStepIndex = 0;
        wasAtRewardsStepWhenAddingNew = false;
        newSectionLastStepIndex = 0;
        
        // Reset counters based on current selections
        websiteCounter = websiteSelected ? 1 : 0;
        mobileCounter = mobileSelected ? 1 : 0;
        apiCounter = apiSelected ? 1 : 0;
        
        // Clear the step container
        stepContainer.innerHTML = '';

        // Track whether any steps were added
        let stepsAdded = false;

        // Add steps based on selections with error handling
        try {
            if (websiteSelected) {
                console.log('Adding website section');
                addWebsiteSection();
                stepsAdded = true;
            }
            if (mobileSelected) {
                console.log('Adding mobile section');
                addMobileSection();
                stepsAdded = true;
            }
            if (apiSelected) {
                console.log('Adding API section');
                addApiSection();
                stepsAdded = true;
            }
        } catch (error) {
            console.error('Error generating steps:', error);
            return false;
        }
        
        // Add Rewards Step before final summary (only if not already in DOM)
        const rewardsStep = document.getElementById('rewards-step');
        if (!rewardsStep) {
            const { rewards } = await loadTemplate();
            stepContainer.insertAdjacentHTML('beforeend', createRewardsStep(rewards));
            addToStepSequence('rewards-step');
            initRewardTierEvents(rewards);
        } else if (!stepSequence.includes('rewards-step')) {
            // If rewards step exists in DOM but not in sequence, add it back
            addToStepSequence('rewards-step');
            // Reinitialize events if needed
            const { rewards } = await loadTemplate();
            initRewardTierEvents(rewards);
        }
        
        // Add final summary page (only if not already in sequence)
        if (!stepSequence.includes('final-step')) {
            ensureFinalStepExists();
        }

        // Validation: At least one section selected
        if (!stepsAdded) {
            console.error('No section selected');
            return false;
        }

        // Log the generated step sequence for debugging
        console.log('Generated Step Sequence:', stepSequence);

        // Defensive check to avoid showing undefined step
        if (!stepSequence.length) {
            console.error('Step sequence is empty — no steps added');
            return false;
        }
        
        console.log('Final step sequence:', stepSequence);
        
        // Mark steps as generated
        stepsGenerated = true;

        // Show buttons (previously hidden for layout purposes)
        ['resetButton', 'backButton', 'nextButton'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });

        // Restore the last step after generating all steps
        if (stepSequence.length > 0) {
            console.log('Hiding all steps before restoration');
            // First hide all steps
            document.querySelectorAll('.step').forEach(step => {
                step.classList.add('hidden');
            });
            
            // Try to restore the saved step, or show the first step
            console.log('Calling restoreLastStep');
            await restoreLastStep();
            console.log('restoreLastStep completed');
        }

        // Update navigation bar with the new steps
        updateNavigationBar();
        
        // Update UI state
        updateButtons();
        updateStepListDisplay();
        
        // Load any saved form state
        loadFormState();
        
        // Ensure all event listeners are attached
        attachSaveListeners();
        
        // Hide intro image and show step controls
        const introImageContainer = document.getElementById('introImageContainer');
        const stepTracker = document.getElementById('stepTracker');
        
        if (introImageContainer) {
            introImageContainer.classList.add('hidden');
        }
        if (stepTracker) {
            stepTracker.classList.remove('hidden');
        }
        
        // Show fixed navigation buttons if they exist
        const fixedNavButtons = document.getElementById('fixedNavButtons');
        if (fixedNavButtons) {
            fixedNavButtons.classList.remove('hidden');
        }
        
        console.log('Wizard initialized with steps:', stepSequence);
        return true;
    } catch (error) {
        console.error('Error generating steps:', error);
        return false;
    } finally {
        isGenerating = false;
    }
}

function generateStepLabels() {
    const labels = [];
    const seenGroups = new Set();
  
    stepSequence.forEach(stepId => {
      const match = stepId.match(/^(web|mobile|api)-(\d+)$/);
  
      if (!match) {
        if (stepId !== 'final-step' && stepId !== 'rewards-step') {
          console.warn('Unexpected step ID format:', stepId);
        }
        return; // Skip unrecognised format
      }      
  
      const sectionType = match[1]; // 'web', 'mobile', 'api'
      const number = match[2];      // e.g. '1'
      const groupId = `${sectionType}-${number}`;
  
      if (!seenGroups.has(groupId)) {
        seenGroups.add(groupId);
  
        if (sectionType === 'web') {
          labels.push(`Website ${number}`);
        } else if (sectionType === 'mobile') {
          labels.push(`Mobile App ${number}`);
        } else if (sectionType === 'api') {
          labels.push(`API ${number}`);
        }
      }
    });
    
    if (stepSequence.includes('rewards-step')) {
        labels.push('Rewards');
    }      

    if (stepSequence.includes('final-step')) {
      labels.push('Summary');
    }
  
    return labels;
  }   

  function getGroupStepIndex(stepId) {
    const groupOrder = [];
    const seenGroups = new Set();
  
    for (const id of stepSequence) {
      const match = id.match(/^(web|mobile|api)-(\d+)$/);
      if (match) {
        const groupId = `${match[1]}-${match[2]}`;
        if (!seenGroups.has(groupId)) {
          seenGroups.add(groupId);
          groupOrder.push(groupId);
        }
      }
    }
  
    // Handle rewards-step and final-step as special cases
    if (stepId === 'rewards-step') {
      return groupOrder.length; // placed after all group sections
    }
  
    if (stepId === 'final-step') {
      return groupOrder.length + 1; // always comes last
    }
  
    // Extract group for normal sections
    const currentMatch = stepId.match(/^(web|mobile|api)-(\d+)$/);
    if (!currentMatch) return -1;
  
    const currentGroupId = `${currentMatch[1]}-${currentMatch[2]}`;
    return groupOrder.indexOf(currentGroupId);
  }  
  
  function updateNavigationBar() {
    const container = document.getElementById('stepTracker');
    container.innerHTML = '';
  
    const steps = generateStepLabels();
    const currentId = stepSequence[currentStepIndex];
  
    let activeGroupIndex = getGroupStepIndex(currentId);
  
    if (currentId === 'final-step' || currentId === 'rewards-step') {
      activeGroupIndex = stepSequence.filter(id =>
        id.startsWith('web-') || id.startsWith('mobile-') || id.startsWith('api-')
      ).reduce((uniqueGroups, id) => {
        const groupId = id.split('-').slice(0, 2).join('-');
        if (!uniqueGroups.includes(groupId)) uniqueGroups.push(groupId);
        return uniqueGroups;
      }, []).length;
  
      if (currentId === 'rewards-step') activeGroupIndex += 1;
    }
  
    steps.forEach((label, index) => {
      const isSummary = label === 'Summary';
      const isRewards = label === 'Rewards';
  
      const groupNumber = label.match(/\d+$/)?.[0];
      const typePrefix = label.startsWith('Website') ? 'web' :
                         label.startsWith('Mobile') ? 'mobile' :
                         label.startsWith('API') ? 'api' : '';
  
      const groupPrefix = `${typePrefix}-${groupNumber}`;
  
      const groupStepIds = isSummary
        ? stepSequence.filter(id => id === 'final-step')
        : stepSequence.filter(id => id.startsWith(`${groupPrefix}`));
  
      const totalStepsInGroup = groupStepIds.length;
      const currentGroupId = currentId.split('-').slice(0, 2).join('-');
      const isCurrent = isSummary
        ? currentId === 'final-step'
        : isRewards
          ? currentId === 'rewards-step'
          : groupStepIds.includes(currentId);
  
      const isComplete = index < activeGroupIndex;
  
      const currentStepInGroup = isCurrent && !isSummary
        ? groupStepIds.indexOf(currentId) + 1
        : null;
  
      const step = document.createElement('div');
      step.className = 'flex flex-col items-center text-center min-w-[60px]';
  
      // Step numbers (hide if only one step in group)
      let stepNumbersHTML = '';
      if (!isSummary && totalStepsInGroup > 1) {
        for (let i = 1; i <= totalStepsInGroup; i++) {
          const isCurrentStepNumber = i === currentStepInGroup && isCurrent;
          stepNumbersHTML += `<span class="${isCurrentStepNumber ? 'text-blue-600 font-bold text-sm' : 'text-gray-400 text-xs'} mx-1">${i}</span>`;
        }
      }
  
      const summaryBox = `
        <div class="w-10 h-10 flex items-center justify-center rounded-md border border-blue-300 bg-white text-blue-500 text-lg shadow-sm">
          📄
        </div>`;
  
      const regularCircle = `
        <div class="w-10 h-10 flex items-center justify-center rounded-full 
          ${isCurrent ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500' :
          isComplete ? 'bg-blue-500 text-white' :
          'border border-blue-300 text-blue-400'}">
          ${isComplete ? '✓' : index + 1}
        </div>`;
  
      const rewardsBox = `
        <div class="w-10 h-10 flex items-center justify-center rounded-md border border-blue-300 bg-white text-blue-500 text-lg shadow-sm">
          💵
        </div>`;
  
      step.innerHTML = `
        ${isSummary ? summaryBox : isRewards ? rewardsBox : regularCircle}
        <div class="mt-2 text-xs ${isCurrent ? 'font-semibold text-blue-600' : 'text-gray-500'}">${label}</div>
        <div class="mt-1 min-h-[16px]">${stepNumbersHTML || '&nbsp;'}</div>
      `;
  
      container.appendChild(step);
  
      if (isCurrent) {
        setTimeout(() => {
          step.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
        }, 0);
      }
    });
  }  
  
  window.showStep = async function(stepId) {
    console.log('showStep called with stepId:', stepId);
    
    // If stepId is a number, treat it as an index
    if (typeof stepId === 'number' && stepSequence[stepId]) {
      stepId = stepSequence[stepId];
    }
    
    // Save the current step index to localStorage
    const currentIndex = stepSequence.indexOf(stepId);
    if (currentIndex === -1) {
      console.warn('Step ID not found in sequence:', stepId);
      return false;
    }
    
    // Only update if the step is changing
    if (currentStepIndex !== currentIndex) {
      currentStepIndex = currentIndex;
      localStorage.setItem('currentStepIndex', currentIndex);
      console.log('Updated currentStepIndex to:', currentIndex);
    }
    
    console.log('showStep Debug Information');
    console.log('Current Step Sequence:', stepSequence);
    console.log('Current Step Index:', currentStepIndex);
    console.log('Target Step ID:', stepId);

    // Validate step ID
    if (!stepId) {
        console.error('Invalid step ID');
        return false;
    }

    // Hide all steps first
    hideAllSteps();

    // Show the specific step
    const step = document.getElementById(stepId);
    if (!step) {
        console.error(`Step with ID ${stepId} not found in DOM`);
        // If the step doesn't exist, try to go to the first step
        if (stepSequence.length > 0) {
            const firstStep = stepSequence[0];
            console.log(`Step not found, redirecting to first step: ${firstStep}`);
            const firstStepElement = document.getElementById(firstStep);
            if (firstStepElement) {
                firstStepElement.classList.remove('hidden');
                currentStepIndex = 0;
                localStorage.setItem('currentStepIndex', 0);
                updateNavigationBar();
                updateButtons();
                updateStepListDisplay();
                return true;
            }
        }
        return false;
    }

    console.log('Making step visible:', stepId);
    step.classList.remove('hidden');
    
    // Small delay to ensure DOM updates before updating UI
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update UI to reflect current step
    updateNavigationBar();
    updateButtons();
    updateStepListDisplay();
    
    // Scroll the step into view if needed
    step.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    console.log('Successfully showed step:', stepId);
    
    // Load template data and update UI based on the current step
    if (stepId === 'rewards-step' || stepId === 'final-step') {
        try {
            const { template, rewards } = await loadTemplate();
            
            // Handle rewards step
            if (stepId === 'rewards-step') {
                const rewardsEditor = document.getElementById('rewardDetails');
                const rewardsInput = document.getElementById('rewardsDescription');
                const trixEditor = document.querySelector('trix-editor[input="rewardsDescription"]');
                
                // Load API data if in auto mode
                if (setupMode === 'auto') {
                  const domain = localStorage.getItem('autoModeDomain');
                  if (domain && (!storedApiData.mobileDetails && !storedApiData.apiDetails)) {
                    // Only load if we haven't already loaded data
                    loadApiDataInBackground(domain);
                  }
                }
                
                if (rewardsEditor) {
                    try {
                        // Try to load saved rewards first
                        const savedRewards = localStorage.getItem('rewardsDescription');
                        const savedTier = localStorage.getItem('selectedRewardTier');
                        
                        // If we have a saved tier, make sure its UI is properly updated
                        if (savedTier) {
                            const savedRadio = document.querySelector(`input[name="rewardTier"][value="${savedTier}"]`);
                            if (savedRadio && !savedRadio.checked) {
                                savedRadio.checked = true;
                                const event = new Event('change');
                                savedRadio.dispatchEvent(event);
                            }
                        }
                        
                        // Update the rewards editor with saved content or default
                        if (savedRewards) {
                            rewardsEditor.innerHTML = savedRewards;
                            if (rewardsInput) rewardsInput.value = savedRewards;
                            if (trixEditor) trixEditor.editor.loadHTML(savedRewards);
                            // Also save to rewardsData for backward compatibility
                            localStorage.setItem('rewardsData', savedRewards);
                        } else if (rewards) {
                            // Otherwise use default rewards
                            rewardsEditor.innerHTML = rewards;
                            if (rewardsInput) rewardsInput.value = rewards;
                            if (trixEditor) trixEditor.editor.loadHTML(rewards);
                            // Save the default rewards for future use
                            localStorage.setItem('rewardsDescription', rewards);
                            localStorage.setItem('rewardsData', rewards);
                        }
                    } catch (error) {
                        console.error('Error loading rewards:', error);
                        // Fallback to default rewards on error
                        if (rewards) {
                            rewardsEditor.innerHTML = rewards;
                            localStorage.setItem('rewardsDescription', rewards);
                            localStorage.setItem('rewardsData', rewards);
                        }
                    }
                }
                
                // Save rewards data when leaving the rewards step
                const saveRewardsData = () => {
                    if (rewardsEditor) {
                        const rewardHTML = rewardsEditor.innerHTML.trim();
                        if (rewardHTML) {
                            localStorage.setItem('rewardsDescription', rewardHTML);
                            localStorage.setItem('rewardsData', rewardHTML);
                        }
                    }
                };
                
                // Save when leaving the rewards step
                window.addEventListener('beforeunload', saveRewardsData);
                // Also save when the user navigates away
                window.addEventListener('unload', saveRewardsData);
            }
            
            // Handle final step
            if (stepId === 'final-step') {
                const formData = getFormData();
                if (setupMode === 'auto') {
                  updateFinalSummaryEditorAuto(template, formData, rewards);
                } else {
                  updateFinalSummaryEditor(template, formData, rewards);
                }
                // Create API data button for the final step
                createViewApiDataButton();
            }
        } catch (error) {
            console.error('Error in showStep template handling:', error);
        }
    }
    
    // Restore form state for visible fields
    const formState = JSON.parse(localStorage.getItem('formState') || '{}');
    document.querySelectorAll('input, textarea, select').forEach(field => {
      if (field.type === 'checkbox') {
        field.checked = formState[field.id] || false;
      } else if (field.type === 'radio') {
        // Handle radio buttons by checking if this specific radio is selected
        if (formState[field.name] === field.value) {
          field.checked = true;
        }
      } else {
        field.value = formState[field.id] || '';
      }

      // Handle visibility of mobile app version field
      if (field.id.includes('mobileVersionOption-')) {
        const versionField = document.getElementById(field.id.replace('Option', 'Version'));
        if (versionField) {
          versionField.classList.toggle('hidden', field.value !== 'specific');
        }
      }
    });

    // If it's the final summary step, render using full template and form data
    if (stepId === 'final-step') {
        try {
            const formData = getFormData();
            console.log('Form data for summary:', formData);
            
            // Ensure template and rewards are loaded
            const { template: loadedTemplate, rewards: loadedRewards } = await loadTemplate();
            
            if (!loadedTemplate || !loadedTemplate.length) {
                console.error('Template not loaded');
                return;
            }
            if (setupMode === 'auto') {
              updateFinalSummaryEditorAuto(loadedTemplate, formData, loadedRewards || {});
            } else {
              updateFinalSummaryEditor(loadedTemplate, formData, loadedRewards || {});
            }
        } catch (error) {
            console.error('Error rendering final summary:', error);
            // Show error to user
            const summaryElement = document.getElementById('finalSummaryContent');
            if (summaryElement) {
                summaryElement.innerHTML = `
                    <div class="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                        <p class="font-bold">Error</p>
                        <p>Failed to load the summary. Please try again.</p>
                    </div>
                `;
            }
        }
    }      
    
}

/**
 * Helper: Format the website URL in the same format as manual mode
 */
function formatWebsiteDataForSummary(domain) {
  if (!domain) return '';
  const lines = ['🌐 WEBSITE'];
  lines.push(`<strong>URL:</strong> ${domain}`);
  return `<div class="mb-2">${lines.join('<br>')}</div>`;
}

/**
 * Helper: Format mobile app data in the same format as manual mode
 */
function formatMobileDataForSummary(mobileDetails) {
  if (!mobileDetails) return '';
  
  // Array to collect all mobile app entries
  const appEntries = [];
  
  // Process main app - use suggested app(s) if available
  if (Array.isArray(mobileDetails.suggested_apps) && mobileDetails.suggested_apps.length > 0) {
    const appName = mobileDetails.suggested_name || mobileDetails.suggested_apps[0].name;
    let hasIOS = false;
    let hasAndroid = false;
    
    // Process iOS platform
    const iosApp = mobileDetails.suggested_apps.find(app => app.platform === 'iOS');
    if (iosApp) {
      hasIOS = true;
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Platform:</strong> Apple: ${iosApp.url}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
    
    // Process Android platform
    const androidApp = mobileDetails.suggested_apps.find(app => app.platform === 'Android');
    if (androidApp) {
      hasAndroid = true;
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Platform:</strong> Android: ${androidApp.url}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
    
    // If no platforms were found, create a generic entry
    if (!hasIOS && !hasAndroid && mobileDetails.suggested_apps.length > 0) {
      const lines = ['📱MOBILE APP'];
      lines.push(`<strong>App Name:</strong> ${appName}`);
      lines.push(`<strong>Version:</strong> Current`);
      appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
    }
  }
  
  // Process alternative apps
  if (mobileDetails.alternatives) {
    // Process iOS alternatives
    if (Array.isArray(mobileDetails.alternatives.iOS)) {
      mobileDetails.alternatives.iOS.forEach(app => {
        const lines = ['📱MOBILE APP'];
        lines.push(`<strong>App Name:</strong> ${app.name}`);
        lines.push(`<strong>Platform:</strong> Apple: ${app.url}`);
        lines.push(`<strong>Version:</strong> Current`);
        appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
      });
    }
    
    // Process Android alternatives
    if (Array.isArray(mobileDetails.alternatives.Android)) {
      mobileDetails.alternatives.Android.forEach(app => {
        const lines = ['📱MOBILE APP'];
        lines.push(`<strong>App Name:</strong> ${app.name}`);
        lines.push(`<strong>Platform:</strong> Android: ${app.url}`);
        lines.push(`<strong>Version:</strong> Current`);
        appEntries.push(`<div class="mb-2">${lines.join('<br>')}</div>`);
      });
    }
  }
  
  // Use the same spacing approach as extractSectionHTML
  return appEntries
    .map((entry, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + entry : entry))
    .join('');
}

/**
 * Helper: format the stored API data in the same format as manual mode
 * "🧩API" HTML snippet
 */
function formatApiDataForSummary(apiData) {
  if (!apiData) return '';
  
  // Check if there's any meaningful API data
  const hasApiUrl = apiData.suggestedApi || (Array.isArray(apiData.apiUrls) && apiData.apiUrls.length > 0);
  const hasDocUrl = Array.isArray(apiData.documentationUrls) && apiData.documentationUrls.length > 0;
  
  // If no meaningful API data exists, return empty string to prevent showing just the heading
  if (!hasApiUrl && !hasDocUrl) {
    return '';
  }
  
  const lines = ['🧩API'];

  if (apiData.suggestedApi) {
    lines.push(`<strong>URL:</strong> ${apiData.suggestedApi}`);
  } else if (Array.isArray(apiData.apiUrls) && apiData.apiUrls.length) {
    lines.push(`<strong>URL:</strong> ${apiData.apiUrls[0]}`);
  }
  
  if (Array.isArray(apiData.documentationUrls) && apiData.documentationUrls.length) {
    lines.push(`<strong>Documentation:</strong> ${apiData.documentationUrls[0]}`);
  }

  return `<div class="mb-2">${lines.join('<br>')}</div>`;
}

/**
 * updateFinalSummaryEditorAuto
 *
 * Exactly parallels your existing updateFinalSummaryEditor(),
 * except that it appends the auto‐loaded API details block
 * (via storedApiData.apiDetails) into the “--START IN-SCOPE--” section.
 *
 * Call this _instead_ of updateFinalSummaryEditor(...) when in auto mode.
 *
 * @param {Array}   template  — from loadTemplate().template
 * @param {Object}  formData  — from getFormData()
 * @param {Object}  rewards   — from loadTemplate().rewards
 */
function updateFinalSummaryEditorAuto(template, formData, rewards) {
  const inputEl = document.getElementById('final-step-input');
  const trixEditorEl = document.querySelector('trix-editor[input="final-step-input"]');
  if (!inputEl || !trixEditorEl) return;

  // 1) render the base template + any built‐in sections
  let fullHTML = renderTemplate(template, formData, rewards);

  // 2) build our “In-Scope Assets” block using the new formatter functions
  // Get the domain from localStorage
  const domain = localStorage.getItem('autoModeDomain');
  
  // Format website data
  const websitesHTML = domain ? formatWebsiteDataForSummary(domain) : '';
  
  // Format mobile app data
  const mobilesHTML = formatMobileDataForSummary(storedApiData.mobileDetails);
  
  // Format API data
  const apisHTML = formatApiDataForSummary(storedApiData.apiDetails);

  // Mirror exactly how extractSectionHTML adds spacing between sections
  let assetsContent = '';
  const sectionHtmls = [];
  
  // Collect all non-empty sections
  if (websitesHTML) sectionHtmls.push(websitesHTML);
  if (mobilesHTML) sectionHtmls.push(mobilesHTML);
  if (apisHTML) sectionHtmls.push(apisHTML);
  
  // Add spacing between sections exactly like extractSectionHTML does
  assetsContent = sectionHtmls
    .map((block, idx) => (idx > 0 ? '<div class="mb-2">&nbsp;</div>' + block : block))
    .join('');
  
  const assetsBlock = [
    '--START IN-SCOPE--',
    '<p><strong>In-Scope Assets</strong></p>',
    assetsContent,
    '\n--END IN-SCOPE--'
  ].join('');

  // 3) build the "Rewards" block using shared function
  const rewardsBlock = buildRewardsBlock(formData);

  // 4) inject them into our template via your existing marker‐replacer
  fullHTML = replaceBlockByMarker(fullHTML, 'IN-SCOPE', assetsBlock);
  fullHTML = replaceBlockByMarker(fullHTML, 'REWARDS',  rewardsBlock);

  // 5) push into the Trix editor
  inputEl.value = fullHTML;
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  trixEditorEl.editor.loadHTML(fullHTML);
}

function updateFinalSummaryEditor(template, formData, rewards) {
    const input = document.getElementById('final-step-input');
    const finalContent = document.getElementById('finalSummaryContent');
    if (!input || !finalContent) return;
  
    const existingHTML = input.value?.trim();
    const fullTemplateHTML = renderTemplate(template, formData, rewards);
  
    const assetsHTML =
      extractSectionHTML('websites', formData) +
      extractSectionHTML('mobileApps', formData) +
      extractSectionHTML('apis', formData);
  
    // Use common asset block format
    const assetsBlock = `--START IN-SCOPE--<p><strong>In-Scope Assets</strong></p>${assetsHTML}--END IN-SCOPE--`;
    
    // Use the shared rewards block builder function
    const rewardsBlock = buildRewardsBlock(formData);
    
    if (!existingHTML) {
      // First time → insert blocks with markers
      let updatedHTML = fullTemplateHTML;
  
      updatedHTML = replaceBlockByMarker(updatedHTML, 'IN-SCOPE', assetsBlock);
      updatedHTML = replaceBlockByMarker(updatedHTML, 'REWARDS', rewardsBlock);
    
      // Fix marker layout (move END to its own line)
      updatedHTML = updatedHTML
        .replace('--END IN-SCOPE--', '\n--END IN-SCOPE--')
        .replace('--END REWARDS--', '\n--END REWARDS--');

      input.value = updatedHTML;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      finalContent.editor.loadHTML(updatedHTML);
      console.log('Loaded full template with injected visible markers');
      return;
    }
  
    // Update existing marker blocks
    let updatedHTML = existingHTML;
  
    updatedHTML = replaceBlockByMarker(updatedHTML, 'IN-SCOPE', assetsBlock);
    updatedHTML = replaceBlockByMarker(updatedHTML, 'REWARDS', rewardsBlock);
  
    input.value = updatedHTML;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    finalContent.editor.loadHTML('');
    setTimeout(() => {
      finalContent.editor.loadHTML(updatedHTML);
    }, 10);
  
    console.log('✅ Summary updated using visible marker-based replacements');
  }  

  function buildRewardsBlock(formData) {
    // Check if a reward tier has been selected
    const hasSelectedRewardTier = localStorage.getItem('selectedRewardTier');
    
    // If no reward tier selected, return empty rewards section
    if (!hasSelectedRewardTier) {
      console.log('No reward tier selected, skipping rewards block');
      return '--START REWARDS--<p><strong>Rewards</strong></p><p>Please select a reward tier to define your bounty structure.</p>--END REWARDS--';
    }
    
    let rewardHTML = '';
    const rewardDetailsEl = document.getElementById('rewardDetails');
  
    if (rewardDetailsEl && rewardDetailsEl.innerHTML.trim()) {
      rewardHTML = rewardDetailsEl.innerHTML.trim();
    } else {
      const raw = formData.rewardsDescription || '';
      rewardHTML = raw.replace(/(<div><br><\/div>\s*)+$/i, '').trim();
    }
  
    // Clean leading junk divs or blank lines
    rewardHTML = rewardHTML.replace(/^(\s*<div><br><\/div>\s*)+/i, '').replace(/^\s*\n+/g, '');
  
    // Ensure we do NOT double-inject the sentence
    const sentence = 'We offer bounties based on the severity and impact of the vulnerability:';
    const intro = `<p><strong>Rewards</strong></p><p>${sentence}</p><br>`;
  
    // Strip if already included in rewardHTML
    rewardHTML = rewardHTML.replace(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
  
    return `--START REWARDS--${intro}${rewardHTML}--END REWARDS--`;
  }  

function replaceBlockByMarker(existingHTML, sectionName, replacementBlock) {
  const startMarker = `--START ${sectionName.toUpperCase()}--`;
  const endMarker = `--END ${sectionName.toUpperCase()}--`;

  const startIndex = existingHTML.indexOf(startMarker);
  const endIndex = existingHTML.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.warn(`⚠️ Missing markers for "${sectionName}"`);
    return existingHTML;
  }

  const before = existingHTML.slice(0, startIndex).trimEnd();
  const after = existingHTML.slice(endIndex + endMarker.length).trimStart();

  return `${before}${replacementBlock}${after}`;
}

/**
 * Build the HTML snippet for a given section of the summary.
 *
 * @param {string} field       One of "websites", "mobileApps", "apis", "rewardsDescription"
 * @param {object} formData    The object returned by getFormData()
 * @returns {string}           The HTML to inject into your final summary
 */
function extractSectionHTML(field, formData) {
  let html = '';
  const formatText = txt => (txt || '').replace(/\n/g, '<br>');

  // --- WEBSITES ---
  if (field === 'websites' && Array.isArray(formData.websites)) {
    formData.websites.forEach((site, idx) => {
      const hasContent = site.url || site.subdomains || site.ipRanges;
      if (!hasContent) return;
      const lines = [];
      if (idx > 0) lines.push('&nbsp;');
      lines.push('🌐 WEBSITE');
      if (site.url)       lines.push(`<strong>URL:</strong> ${formatText(site.url)}`);
      // we skip subdomains/ipRanges per John's request
      html += `<div class="mb-2">${lines.join('<br>')}</div>`;
    });
  }

  // --- MOBILE APPS ---
  else if (field === 'mobileApps' && Array.isArray(formData.mobileApps)) {
    // grab exactly the mobile step IDs, in display order
    const mobileStepIds = stepSequence.filter(id => id.startsWith('mobile-'));

    mobileStepIds.forEach((stepId, idx) => {
      const app = formData.mobileApps[idx];
      if (!app) return;
      const hasContent = app.name || app.appStores || app.version;
      if (!hasContent) return;

      const lines = [];
      const hadWebsites = Array.isArray(formData.websites) && formData.websites.length > 0;
      if (idx > 0 || hadWebsites) lines.push('&nbsp;');

      lines.push('📱MOBILE APP');
      if (app.name)      lines.push(`<strong>App Name:</strong> ${formatText(app.name)}`);
      
      // Add suggested app name from API data if available
      if (setupMode === 'auto' && storedApiData.mobileDetails && storedApiData.mobileDetails.appName) {
        lines.push(`<strong>Suggested App Name:</strong> ${formatText(storedApiData.mobileDetails.appName)}`);
      }
      
      if (app.appStores) lines.push(`<strong>Platforms:</strong> ${formatText(app.appStores)}`);

      // lookup saved version-option; if missing or “current”, default to Current
      const versionOption = localStorage.getItem(`mobileVersionOption-${stepId}`);
      if (versionOption === 'specific' && app.version) {
        lines.push(`<strong>Versions:</strong> ${formatText(app.version)}`);
      } else {
        lines.push(`<strong>Versions:</strong> Current`);
      }

      html += `<div class="mb-2">${lines.join('<br>')}</div>`;
    });
  }

  // --- APIS ---
  else if (field === 'apis' && Array.isArray(formData.apis)) {
    formData.apis.forEach((api, idx) => {
      const hasContent = api.baseUrl || api.docs;
      if (!hasContent) return;

      const lines = [];
      const hadWebsites = Array.isArray(formData.websites) && formData.websites.length > 0;
      const hadMobiles  = Array.isArray(formData.mobileApps) && formData.mobileApps.length > 0;
      if (idx > 0 || hadWebsites || hadMobiles) lines.push('&nbsp;');

      lines.push('🧩API');
      if (api.baseUrl) lines.push(`<strong>URL:</strong> ${formatText(api.baseUrl)}`);
      if (api.docs)    lines.push(`<strong>Documentation:</strong> ${formatText(api.docs)}`);

      html += `<div class="mb-2">${lines.join('<br>')}</div>`;
    });
  }

  // --- REWARDS DESCRIPTION ---
  else if (
    field === 'rewardsDescription' &&
    typeof formData.rewardsDescription === 'string' &&
    formData.rewardsDescription.trim()
  ) {
    html += `<div class="mb-2">${formatText(formData.rewardsDescription)}</div>`;
  }

  return html.trim();
}

// If the user has navigated to the end of the form and added a new section then show a jump button to go back to the end of the form   
function checkJumpToEndEligibility() {
  const jumpButton = document.getElementById('jumpToEndButton');
  const isAtRewardsStep = currentStepIndex === stepSequence.length - 2;
  const isAtFinalStep = currentStepIndex >= stepSequence.length - 1;

  // 1) Show Jump button if user added a new section from Rewards and has moved one step into that new section
  if (wasAtRewardsStepWhenAddingNew && currentStepIndex === newSectionLastStepIndex + 1) {
    jumpButton?.classList.remove('hidden');
  }

  // 2 & 3) Hide Jump button if they reach or go beyond the final step
  if (isAtFinalStep) {
    jumpButton?.classList.add('hidden');
    wasAtRewardsStepWhenAddingNew = false;
    newSectionLastStepIndex = 0;
  }
}

function updateButtons() {
    // Hide add buttons in auto mode and return early

    const backButton = document.getElementById('backButton');
    const nextButton = document.getElementById('nextButton');

    if (backButton) {
        backButton.disabled = currentStepIndex === 0;
        backButton.classList.toggle('opacity-50', currentStepIndex === 0);
    }

    if (nextButton) {
        const atLastStep = currentStepIndex === stepSequence.length - 1;
        nextButton.disabled = atLastStep;
        nextButton.classList.toggle('opacity-50', atLastStep);
    }

    const addWebsiteBtn = document.getElementById('addWebsiteBtn');
    const addMobileBtn = document.getElementById('addMobileBtn');
    const addApiBtn = document.getElementById('addApiBtn');

    const currentStepId = stepSequence[currentStepIndex];

    const copyButton = document.getElementById('copyButton');
    if (copyButton) {
        copyButton.classList.toggle('hidden', currentStepId !== 'final-step');
    }

    const isFinalStep = currentStepId === 'final-step';
    const atLastRealStep =
        stepSequence.length > 1 &&
        stepSequence[stepSequence.length - 2] === currentStepId;

    const onWeb = currentStepId.startsWith('web-') && currentStepIndex === lastWebsiteIndex;
    const onMobile = currentStepId.startsWith('mobile-') && currentStepIndex === lastMobileIndex;
    const onApi = currentStepId.startsWith('api-') && currentStepIndex === lastApiIndex; 

    // If it's auto then do not show the add buttons
    if (typeof setupMode !== 'undefined' && setupMode === 'auto') {
      document.getElementById('addWebsiteBtn')?.classList.add('hidden');
      document.getElementById('addMobileBtn')?.classList.add('hidden');
      document.getElementById('addApiBtn')?.classList.add('hidden');
    }
    else 
    {
      // Show all 3 Add buttons at the last real step, not the summary
      if (atLastRealStep) {
          addWebsiteBtn.classList.remove('hidden');
          addMobileBtn.classList.remove('hidden');
          addApiBtn.classList.remove('hidden');
      } else if (isFinalStep) {
          addWebsiteBtn.classList.add('hidden');
          addMobileBtn.classList.add('hidden');
          addApiBtn.classList.add('hidden');
      } else {
          addWebsiteBtn.classList.toggle('hidden', !onWeb);
          addMobileBtn.classList.toggle('hidden', !onMobile);
          addApiBtn.classList.toggle('hidden', !onApi);
      }
    }

    // Sync fixed buttons
    const backButtonBottom = document.getElementById('backButtonBottom');
    const nextButtonBottom = document.getElementById('nextButtonBottom');

    if (backButtonBottom) {
        backButtonBottom.disabled = currentStepIndex === 0;
        backButtonBottom.classList.toggle('opacity-50', currentStepIndex === 0);
  }

  if (nextButtonBottom) {
    const atLastStep = currentStepIndex === stepSequence.length - 1;
    nextButtonBottom.disabled = atLastStep;
    nextButtonBottom.classList.toggle('opacity-50', atLastStep);
  }
  checkJumpToEndEligibility()

}

window.goToPreviousStep = async function() {
    console.log('Going to previous step');
    console.log('Current Step Sequence:', stepSequence);
    console.log('Current Step Index:', currentStepIndex);

    if (!stepSequence.length || currentStepIndex === 0) {
        console.log('No previous step available');
        return;
    }

    currentStepIndex--;
    localStorage.setItem('currentStepIndex', currentStepIndex); // Save step

    const previousStepId = stepSequence[currentStepIndex];
    console.log('Previous Step ID:', previousStepId);
    console.log('Previous Step Index:', currentStepIndex);

    // Hide all steps
    hideAllSteps();

    // Show the previous step
    showStep(previousStepId);

    updateNavigationBar();
    updateButtons();
    updateStepListDisplay();

    console.log('Current Step:', previousStepId);
    console.log('Total Steps:', stepSequence.length);
    console.log('Current Step Index:', currentStepIndex);
}

// Function to update step list and current step index display
function updateStepListDisplay() {
    const stepList = document.getElementById('stepList');
    const currentStepIndexDisplay = document.getElementById('currentStepIndexDisplay');

    // Clear existing list
    if (stepList) stepList.innerHTML = '';

    // Populate step list
    stepSequence.forEach((stepId, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = stepId;
        
        // Highlight current step
        if (index === currentStepIndex) {
            listItem.classList.add('font-bold', 'text-blue-600');
        }
        
        stepList.appendChild(listItem);
    });

    // Update current step index display
    currentStepIndexDisplay.textContent = currentStepIndex;
}

// Step template functions
function toggleAdvancedFields(id) {
  const section = document.getElementById(`advancedFields-${id}`);
  if (section) {
    section.classList.toggle('hidden');

    // Save the current state of all fields when toggling
    const fields = section.querySelectorAll('input, textarea, select');
    fields.forEach(field => {
      saveFormState(field.id, field.type === 'checkbox' ? field.checked : field.value);
    });

    // ✅ NEW: Attach listeners so future input is saved too
    attachSaveListeners();
  }
}

function createWebSection(id) {
  return `
    <div id="${id}" class="question-step min-h-[200px] hidden">
      ${generateLabeledField({
        icon: "🌐",
        labelText: "What is the main URL for your website?",
        tooltipText: `The main URL is the address people use to access your website — usually the homepage.
Example: https://example.com
It should include the protocol (https://) and not end with a slash.
Do not include subdomains like app. or paths like /login`,
        fieldHTML: `<input type="text" id="websiteMainUrl-${id}" class="w-full p-3 border-2 border-gray-300 rounded" placeholder="https://example.com">`
      })}

      <div class="advanced-fields hidden" id="advancedFields-${id}">
        ${generateLabeledField({
          icon: "🌐",
          labelText: "What areas (subdomains) of your website do you want tested?",
          tooltipText: `You can list all subdomains using a wildcard (e.g. *.example.com), or specify exceptions such as:\n\nAll subdomains except: invoicing.example.com, support.example.com`,
          fieldHTML: `
            <textarea
              id="websiteSubdomains-${id}"
              rows="2"
              placeholder="e.g. *.example.com or All subdomains except: billing.example.com, support.example.com"
              class="w-full resize-y overflow-hidden p-3 border-2 border-gray-300 rounded focus:outline-none focus:border-blue-500"
            ></textarea>
          `
        })}

        <div class="mb-4"></div> <!-- Spacer between subdomains and IP ranges -->

        ${generateLabeledField({
          icon: "🌐",
          labelText: "What are the IP Ranges?",
          tooltipText: `IP ranges define the network segments to be tested.\nUse CIDR notation (e.g. 192.168.0.0/24) to cover a block of addresses.\nYou can list multiple ranges separated by commas.\n\nExample:\n192.168.0.0/24, 10.0.0.0/16`,
          fieldHTML: `
            <input
              type="text"
              id="websiteIpRanges-${id}"
              class="w-full p-3 border-2 border-gray-300 rounded"
              placeholder="192.168.0.0/24, 10.0.0.0/16"
            >
          `
        })}
      </div>
    </div>
  `;
}

function attachMobileVersionToggle(id) {
  const radios = document.getElementsByName(`mobileVersionOption-${id}`);
  const versionInput = document.getElementById(`mobileAppVersion-${id}`);

  if (!radios.length || !versionInput) return;

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked && radio.value === 'specific') {
        versionInput.classList.remove('hidden');
      } else {
        versionInput.classList.add('hidden');
        versionInput.value = '';
      }
    });
  });
}

function createMobileSection(id) {
  const html = `
    <div id="${id}" class="question-step min-h-[200px] block space-y-6">

      <div>
        <label class="block text-lg font-semibold text-gray-800 mb-2">
          📱 What is the name of your mobile app?
        </label>
        <input
          type="text"
          id="mobileAppName-${id}"
          class="w-full p-3 border-2 border-gray-300 rounded"
          placeholder="My Mobile App"
        >
      </div>

      <div>
        <label class="block text-lg font-semibold text-gray-800 mb-2">
          📱 What platforms is it released on (e.g. App Store and Play Store)?
        </label>
        <textarea
          id="mobileAppStores-${id}"
          class="w-full p-3 border-2 border-gray-300 rounded focus:outline-none focus:border-blue-500"
          placeholder="e.g. https://apps.apple.com/app/id1234567890&#10;https://play.google.com/store/apps/details?id=com.example"
          rows="3"
        ></textarea>
      </div>

      <div>
        <label class="block text-lg font-semibold text-gray-800 mb-2">
          📱 What version do you want tested?
        </label>
        <div class="mb-2 space-y-2">
          <label class="flex items-center gap-2">
            <input type="radio" name="mobileVersionOption-${id}" value="current" checked class="form-radio text-blue-600">
            <span>Current Version</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="radio" name="mobileVersionOption-${id}" value="specific" class="form-radio text-blue-600">
            <span>Specific Version(s):</span>
            <input
              type="text"
              id="mobileAppVersion-${id}"
              placeholder="e.g. Android: 2.3.1, iOS: 3.1.4"
              class="hidden ml-2 p-1 border border-gray-300 rounded w-[300px] focus:outline-none focus:ring focus:border-blue-500"
            >
          </label>
        </div>
      </div>

    </div>
  `;

  // Wrap in a temp container so we can attach listeners before return
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Return the HTML immediately, we'll attach event listeners when the element is added to the DOM
  const mobileSectionObserver = new MutationObserver((mutations, observer) => {
    const mobileSection = document.getElementById(`mobile-section-${id}`);
    if (!mobileSection) return;

    // Stop observing once we find our element
    observer.disconnect();

    const savedOption = localStorage.getItem(`mobileVersionOption-${id}`);
    const savedText = localStorage.getItem(`mobileAppVersion-${id}`);

    const radios = mobileSection.querySelectorAll(`input[name="mobileVersionOption-${id}"]`);
    const textbox = mobileSection.querySelector(`#mobileAppVersion-${id}`);

    if (!radios.length || !textbox) return;

    // Restore radio selection
    if (savedOption) {
      const selectedRadio = mobileSection.querySelector(`input[name="mobileVersionOption-${id}"][value="${savedOption}"]`);
      if (selectedRadio) selectedRadio.checked = true;
    }

    // Show textbox if 'specific' was selected
    if (savedOption === 'specific' && textbox) {
      textbox.classList.remove('hidden');
    }

    // Restore text input
    if (savedText && textbox) {
      textbox.value = savedText;
    }

    // Save on change
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        const selected = radio.value;
        localStorage.setItem(`mobileVersionOption-${id}`, selected);
        if (selected === 'specific' && textbox) {
          textbox.classList.remove('hidden');
        } else if (textbox) {
          textbox.classList.add('hidden');
        }
      });
    });

    if (textbox) {
      textbox.addEventListener('input', () => {
        localStorage.setItem(`mobileAppVersion-${id}`, textbox.value);
      });
    }
  });

  // Start observing the document with the configured parameters
  mobileSectionObserver.observe(document.body, { childList: true, subtree: true });

  return temp.innerHTML;
}

function createApiSection(id) {
  return `
    <div id="${id}" class="question-step min-h-[200px] hidden">
      ${generateLabeledField({
        icon: "🧩",
        labelText: "What is the base URL of your API?",
        tooltipText: `This is the main endpoint for your API. It should include the protocol (https://).`,
        fieldHTML: `<input type="text" id="apiBaseUrl-${id}" class="w-full p-3 border-2 border-gray-300 rounded" placeholder="https://api.example.com">`
      })}
      <div class="mt-6"></div>
      ${generateLabeledField({
        icon: "🧩",
        labelText: "What is the URL for your API documentation?",
        tooltipText: `Include a link to any available API documentation that would help researchers understand how to use and test your API.`,
        fieldHTML: `<input type="text" id="apiDocsUrl-${id}" class="w-full p-3 border-2 border-gray-300 rounded" placeholder="https://docs.example.com/api">`
      })}
    </div>
  `;
}

function resetStepsGeneration() {
    stepsGenerated = false;
    console.log('Steps generation reset');
}

function saveFormState(key, value) {
    const state = JSON.parse(localStorage.getItem('formState') || '{}');
    state[key] = value;
    localStorage.setItem('formState', JSON.stringify(state));
}

function saveSectionCounts() {
    localStorage.setItem('sectionCounts', JSON.stringify({
      website: websiteCounter - 1,
      mobile: mobileCounter - 1,
      api: apiCounter - 1
    }));
}

async function loadFormState() {
    const state = JSON.parse(localStorage.getItem('formState') || '{}');
    const processedKeys = new Set();
    
    for (const key in state) {
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);
        
        const el = document.getElementById(key);
        if (!el) continue;
        
        try {
            if (el.type === 'checkbox') {
                el.checked = state[key];
            } else if (el.type === 'radio') {
                if (state[el.name] === el.value) {
                    el.checked = true;
                }
            } else {
                el.value = state[key] || '';
                
                // Handle Trix editor updates
                const trixEditor = document.querySelector(`trix-editor[input="${key}"]`);
                if (trixEditor && trixEditor.editor) {
                    trixEditor.editor.loadHTML(state[key] || '');
                }
                
                // Trigger any change events
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (error) {
            console.error(`Error restoring form state for ${key}:`, error);
        }
    }
  }
  

function attachSaveListeners() {
    
    document.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.dataset.listenerAttached) return; // Skip if already handled
  
      const type = el.type?.toLowerCase();
      const eventType = type === 'checkbox' || type === 'radio' ? 'change' : 'input';
  
      el.addEventListener(eventType, () => {
        if (type === 'checkbox') {
          saveFormState(el.id, el.checked);
        } else {
          saveFormState(el.id, el.value);
        }
      });
  
      el.dataset.listenerAttached = 'true'; // Mark as handled
    });
  }  

function resetWizard() {
    const modal = document.getElementById('resetConfirmModal');
    if (modal) {
      modal.classList.remove('hidden');
  
      // Wire modal buttons
      document.getElementById('confirmResetModal').onclick = () => {
        modal.classList.add('hidden');
        performReset();
      };
  
      document.getElementById('cancelResetModal').onclick = () => {
        modal.classList.add('hidden');
      };
    } else {
      console.error('Reset modal not found');
  }
}
  
  function performReset() {
    // Clear general state and auto mode state
    localStorage.removeItem('sectionSelections');
    localStorage.removeItem('formState');
    localStorage.removeItem('autoMode');
    localStorage.removeItem('autoModeDomain');
    
    // Reset section counters to 1 (since they're 1-indexed)
    websiteCounter = 1;
    mobileCounter = 1;
    apiCounter = 1;
    stepsGenerated = false;
    
    // Reset last index trackers
    lastWebsiteIndex = -1;
    lastMobileIndex = -1;
    lastApiIndex = -1;
    
    // Clear any stored section counts
    ['websiteCount', 'mobileCount', 'apiCount'].forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Clear step sequence and reset index
    stepSequence = [];
    currentStepIndex = 0;
    
    // Reset wizard state
    wasAtRewardsStepWhenAddingNew = false;
    
    // Reset UI to initial state (auto mode selected but not active)
    document.getElementById('setupAuto').checked = true;
    document.getElementById('setupManual').checked = false;
    document.getElementById('autoControls').style.display = 'block';
    document.getElementById('manualControls').style.display = 'none';
    document.getElementById('websiteUrl').value = '';
    document.getElementById('builderContainer').classList.remove('hidden');
    document.getElementById('stepContainer').innerHTML = '';
    document.getElementById('navButtons')?.classList.add('hidden');
    document.getElementById('stepTracker')?.classList.add('hidden');
    document.getElementById('fixedNavButtons')?.classList.add('hidden');
    document.getElementById('introImageContainer')?.classList.remove('hidden');
    newSectionLastStepIndex = 0;
    
    // Clear the step container
    const stepContainer = document.getElementById('stepContainer');
    if (stepContainer) stepContainer.innerHTML = '';
    
    // Reset UI elements
    const toggles = ['websiteToggle', 'mobileToggle', 'apiToggle'];
    toggles.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    
    // Show the builder container if it exists
    if (builderContainer) builderContainer.classList.remove('hidden');
    
    // Hide navigation elements
    const navButtons = document.getElementById('navButtons');
    const stepTracker = document.getElementById('stepTracker');
    if (navButtons) navButtons.classList.add('hidden');
    if (stepTracker) stepTracker.classList.add('hidden');
    
    // Show the intro image
    const introImage = document.getElementById('introImageContainer');
    if (introImage) introImage.classList.remove('hidden');
    localStorage.removeItem('currentStepIndex');
    localStorage.removeItem('sectionCounts');
    localStorage.removeItem('selectedRewardTier');
  
    // Remove all mobile version-related keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('mobileVersionOption-') || key.startsWith('mobileAppVersion-')) {
        localStorage.removeItem(key);
      }
    });
  
    // Reset global state
    websiteSelected = false;
    mobileSelected = false;
    apiSelected = false;
    stepsGenerated = false;
    wasAtRewardsStepWhenAddingNew = false;
    newSectionLastStepIndex = 0;
  
    websiteCounter = 1;
    mobileCounter = 1;
    apiCounter = 1;
  
    lastWebsiteIndex = -1;
    lastMobileIndex = -1;
    lastApiIndex = -1;
  
    location.reload();
  }  
  
  async function loadTemplate() {
    try {
      const response = await fetch('bug-bounty-document-template.json');
      if (!response.ok) throw new Error('Failed to load template');
  
      const json = await response.json();
      console.log('Template loaded:', json);
  
      // Return both parts so the caller can access as needed
      return {
        template: json.template || [],
        rewards: json.rewards || {}
      };
    } catch (error) {
      console.error('Error loading template:', error);
      return {
        template: [],
        rewards: {}
      };
    }
  }  
  
  function renderTemplate(template, formData) {
    let html = '';
  
    template.forEach(block => {
        if (block.type === 'paragraph') {
            const text = block.text || '';
          
            // Avoid wrapping paragraphs that already contain markers or full tags
            if (
              text.includes('<!--') ||
              text.trim().startsWith('<p') ||
              text.trim().startsWith('<div')
            ) {
              html += text;
            } else {
              html += `<p>${text}</p>`;
            }
        }          
  
      if (block.type === 'list') {
        html += '<ul class="bullet-list">';
        block.items.forEach(item => {
          html += `<li>${DOMPurify?.sanitize(item) || item}</li>`;
        });
        html += '</ul>';
      }
  
      if (block.type === 'section') {
        html += extractSectionHTML(block.field, formData);
      }
    });
  
    return html;
  }  
  
  function formatItem(item) {
    // Turn an object into readable text
    if (typeof item === 'string') return item;
  
    if (typeof item === 'object') {
      return Object.entries(item).map(([key, value]) => {
        const val = Array.isArray(value) ? value.join(', ') : value;
        return `<strong>${key}:</strong> ${val}`;
      }).join(' &nbsp;&nbsp; ');
    }
  
    return String(item);
  }  

function getFormData() {
  const formState = JSON.parse(localStorage.getItem('formState') || '{}');
  const websites = [];
  const mobileApps = [];
  const apis = [];

  // Process website data
  for (const [key, value] of Object.entries(formState)) {
    if (key.startsWith('websiteMainUrl-')) {
      const groupId = key.replace('websiteMainUrl-', ''); // Now just gets "website-1" directly

      // Get values from formState
      const subdomains = formState[`websiteSubdomains-${groupId}`] || '';
      const ipRanges = formState[`websiteIpRanges-${groupId}`] || '';

      if (value || subdomains || ipRanges) {
        websites.push({
          url: value,
          subdomains: subdomains ? subdomains.split(/\n|,/).map(s => s.trim()).filter(Boolean).join(', ') : '',
          ipRanges: ipRanges || ''
        });
      }
    }

    // Process mobile data
    if (key.startsWith('mobileAppName-')) {
      const groupId = key.replace('mobileAppName-', ''); // Now just gets "mobile-1" directly

      // Get values from formState
      const platforms = formState[`mobileAppStores-${groupId}`] || '';
      const version = formState[`mobileAppVersion-${groupId}`] || '';

      if (value || platforms || version) {
        mobileApps.push({
          name: value,
          appStores: platforms || '',
          version: version || ''
        });
      }
    }

    // Process API data
    if (key.startsWith('apiBaseUrl-')) {
      const groupId = key.replace('apiBaseUrl-', ''); // Now just gets "api-1" directly

      // Get values from formState
      const docs = formState[`apiDocsUrl-${groupId}`] || '';

      if (value || docs) {
        apis.push({
          baseUrl: value,
          docs: docs || ''
        });
      }
    }
  }

  // Get rewards description from form
  const rewardsDescription = document.getElementById('rewardsDescription')?.value || '';

  // Debug log
  console.log('Form data collected:', {
    websites,
    mobileApps,
    apis,
    rewardsDescription
  });

  return {
    websites,
    mobileApps,
    apis,
    rewardsDescription
  };
}
