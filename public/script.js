const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusText = document.getElementById('status');
const faceCountEl = document.getElementById('face-count');
const expressionStatEl = document.getElementById('expression-stat');
const modeButtons = document.querySelectorAll('.btn[data-mode]');

let currentMode = 'detection'; // Default mode
let modelLoadError = false;

// Start video as soon as possible to request permissions
startVideo();

// Load all required models
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
  faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
]).then(() => {
    isModelLoaded = true;
    console.log("Models Loaded");
    if (video.srcObject) {
         statusText.innerText = "System Ready. Detecting Faces...";
    } else {
         statusText.innerText = "Models Loaded. Waiting for Camera...";
    }
}).catch(err => {
    console.error("Model Loading Error:", err);
    modelLoadError = true;
    statusText.innerText = `Error loading AI models: ${err.message}`;
});

function startVideo() {
  statusText.innerText = "Requesting Camera Access...";
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.innerText = "Camera API not supported in this browser.";
      return;
  }

  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => {
        video.srcObject = stream;
        if (modelLoadError) return; // Don't overwrite error message
        
        if (isModelLoaded) {
             statusText.innerText = "System Ready. Detecting Faces...";
        } else {
             statusText.innerText = "Camera Active. Loading AI Models...";
        }
    })
    .catch(err => {
        console.error("Camera Error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             statusText.innerText = "Camera Access Denied. Please allow permission.";
        } else {
             statusText.innerText = `Camera Error: ${err.message}`;
        }
    });
}

// Handle Mode Switching
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.btn.active').classList.remove('active');
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
    });
});

video.addEventListener('play', () => {
  // Create canvas from video for dimensions
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  window.addEventListener('resize', () => {
      displaySize.width = video.width;
      displaySize.height = video.height;
      faceapi.matchDimensions(canvas, displaySize);
  });

  async function onPlay() {
    if (video.paused || video.ended || !isModelLoaded) {
        if (!video.paused && !video.ended) {
             requestAnimationFrame(onPlay);
        }
        return;
    }

    try {
        let detections;

        // Detect faces based on current mode
        // using TinyFaceDetector for high performance
        // Decreasing input size speeds up processing (e.g., inputSize: 224, scoreThreshold: 0.5)
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

        if (currentMode === 'detection') {
            detections = await faceapi.detectAllFaces(video, options);
        } else if (currentMode === 'landmarks') {
            detections = await faceapi.detectAllFaces(video, options)
                .withFaceLandmarks();
        } else if (currentMode === 'expressions') {
            detections = await faceapi.detectAllFaces(video, options)
                .withFaceLandmarks()
                .withFaceExpressions();
        }

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        // Clear canvas
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Update Stats
        if (resizedDetections) {
            faceCountEl.innerText = resizedDetections.length;
            
            if (getMostLikelyExpression(resizedDetections)) {
                expressionStatEl.innerText = getMostLikelyExpression(resizedDetections);
            } else {
                 expressionStatEl.innerText = "-";
            }
        }

        // Draw Detections
        if (currentMode === 'detection') {
            faceapi.draw.drawDetections(canvas, resizedDetections);
        } else if (currentMode === 'landmarks') {
            faceapi.draw.drawDetections(canvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        } else if (currentMode === 'expressions') {
            faceapi.draw.drawDetections(canvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
            faceapi.draw.drawFaceExpressions(canvas, resizedDetections);
        }
    } catch (e) {
        console.error("Detection error:", e);
    }
    
    // Request next frame
    requestAnimationFrame(onPlay);
  }

  // Start the loop
  onPlay();
});

function getMostLikelyExpression(detections) {
    if (!detections || detections.length === 0) return null;
    
    // Check if expressions data exists (only available in 'expressions' mode or if we called withFaceExpressions)
    // Actually, detectAllFaces returns different structures. 
    // If detection only, no expressions property.
    const firstFace = detections[0];
    if (!firstFace.expressions) return null;

    const expressions = firstFace.expressions;
    // Find expression with highest probability
    const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
    return sorted[0][0]; // Return the name of the expression
}
