<?php
/**
 * Google Calendar Sync Proxy for HostGator (PHP)
 * This script runs on any standard Apache/PHP hosting.
 * It replaces the Node.js /api/calendar/sync endpoint.
 */

// Allow CORS from any origin for API queries during development or cross-domain setup
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Methods: POST, OPTIONS');

// Handle CORS preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// -------------------------------------------------------------------------
// CREDENTIAL CONFIGURE
// -------------------------------------------------------------------------
// You can define your Google credentials here directly, or place them in an 
// `.env` file at the root of your public_html folder.
// -------------------------------------------------------------------------
$config = [
    'GOOGLE_CLIENT_ID' => '',
    'GOOGLE_CLIENT_SECRET' => '',
    'GOOGLE_REFRESH_TOKEN' => '',
    'VITE_GOOGLE_CALENDAR_ID' => ''
];

// Load values from .env if it exists in parent directories (standard setup)
$searchPaths = [
    __DIR__ . '/.env',
    __DIR__ . '/../.env',
    __DIR__ . '/../../.env',
    __DIR__ . '/../../../.env',
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__, 3) . '/.env'
];

foreach ($searchPaths as $path) {
    if (file_exists($path)) {
        $envContent = file_get_contents($path);
        if ($envContent) {
            $lines = explode("\n", $envContent);
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || strpos($line, '#') === 0) {
                    continue;
                }
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $val = trim($parts[1]);
                    // Strip enclosing quotes (double or single)
                    $val = trim($val, '"\'');
                    if (array_key_exists($key, $config)) {
                        $config[$key] = $val;
                    }
                }
            }
        }
        break; // Stop at first found .env
    }
}

$clientId = $config['GOOGLE_CLIENT_ID'];
$clientSecret = $config['GOOGLE_CLIENT_SECRET'];
$refreshToken = $config['GOOGLE_REFRESH_TOKEN'];

// Quick Validation
if (empty($clientId) || empty($clientSecret) || empty($refreshToken)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Missing Google credentials in configuration. Please define them inside public/api/calendar/sync.php or a root .env file.',
        'code' => 'MISSING_CREDENTIALS'
    ]);
    exit();
}

// -------------------------------------------------------------------------
// 1. EXCHANGE REFRESH TOKEN FOR ACCESS TOKEN (Google OAuth2)
// -------------------------------------------------------------------------
$tokenUrl = 'https://oauth2.googleapis.com/token';
$postFields = [
    'client_id' => $clientId,
    'client_secret' => $clientSecret,
    'refresh_token' => $refreshToken,
    'grant_type' => 'refresh_token'
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $tokenUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postFields));
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

$tokenResponse = curl_exec($ch);
$tokenHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($tokenHttpCode !== 200) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to obtain access token from Google API.',
        'code' => 'OAUTH_TOKEN_ERROR',
        'http_code' => $tokenHttpCode,
        'details' => json_decode($tokenResponse, true) ?: $tokenResponse
    ]);
    exit();
}

$tokenData = json_decode($tokenResponse, true);
$accessToken = $tokenData['access_token'];

// -------------------------------------------------------------------------
// 2. RETRIEVE REQ DATA AND CALL GOOGLE CALENDAR API
// -------------------------------------------------------------------------
$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true);

if (!$inputData || !isset($inputData['event'])) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid or empty request body. Expected {"event": {...}}',
        'code' => 'BAD_REQUEST'
    ]);
    exit();
}

$event = $inputData['event'];
$eventId = $inputData['eventId'] ?? null;
// Use requested calendarId, fallback to file config, fallback to 'primary'
$calendarId = $inputData['calendarId'] ?? $config['VITE_GOOGLE_CALENDAR_ID'] ?? 'primary';
if (empty($calendarId)) {
    $calendarId = 'primary';
}

$successResponse = null;
$successCode = 200;

if (!empty($eventId)) {
    // SCENARIO A: Attempt to update existing event
    $updateUrl = "https://www.googleapis.com/calendar/v3/calendars/" . urlencode($calendarId) . "/events/" . urlencode($eventId);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $updateUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($event));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    
    $updateResponse = curl_exec($ch);
    $updateHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($updateHttpCode >= 200 && $updateHttpCode < 300) {
        $successResponse = $updateResponse;
        $successCode = $updateHttpCode;
    } else if ($updateHttpCode === 404) {
        // Event not found, fallback to inserting it as a new event
        $eventId = null; 
    } else {
        // Other unexpected error, return error
        http_response_code($updateHttpCode);
        echo $updateResponse;
        exit();
    }
}

if (empty($eventId)) {
    // SCENARIO B: Insert new event
    $insertUrl = "https://www.googleapis.com/calendar/v3/calendars/" . urlencode($calendarId) . "/events";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $insertUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($event));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    
    $insertResponse = curl_exec($ch);
    $insertHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $successResponse = $insertResponse;
    $successCode = $insertHttpCode;
}

// Return the final result to the React UI
http_response_code($successCode);
echo $successResponse;
?>
