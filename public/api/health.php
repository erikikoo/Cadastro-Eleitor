<?php
/**
 * Diagnostic Endpoint for HostGator (PHP)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$config = [
    'GOOGLE_CLIENT_ID' => '',
    'GOOGLE_CLIENT_SECRET' => '',
    'GOOGLE_REFRESH_TOKEN' => '',
    'VITE_GOOGLE_CALENDAR_ID' => ''
];

$searchPaths = [
    __DIR__ . '/.env',
    __DIR__ . '/../.env',
    __DIR__ . '/../../.env',
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__, 3) . '/.env'
];

$envFound = false;
$foundPath = '';

foreach ($searchPaths as $path) {
    if (file_exists($path)) {
        $envFound = true;
        $foundPath = $path;
        $envContent = file_get_contents($path);
        if ($envContent) {
            $lines = explode("\n", $envContent);
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || strpos($line, '#') === 0) continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $val = trim($parts[1]);
                    $val = trim($val, '"\'');
                    if (array_key_exists($key, $config)) {
                        $config[$key] = $val;
                    }
                }
            }
        }
        break;
    }
}

$googleConfigured = !empty($config['GOOGLE_CLIENT_ID']) && !empty($config['GOOGLE_CLIENT_SECRET']) && !empty($config['GOOGLE_REFRESH_TOKEN']);

echo json_encode([
    'status' => 'ok',
    'environment' => 'HostGator (PHP Backend)',
    'env_file_found' => $envFound,
    'env_file_path' => $envFound ? basename($foundPath) : null,
    'googleConfigured' => $googleConfigured,
    'calendarId' => !empty($config['VITE_GOOGLE_CALENDAR_ID']) ? $config['VITE_GOOGLE_CALENDAR_ID'] : 'primary',
    'diagnostics' => [
        'php_version' => phpversion(),
        'curl_enabled' => function_exists('curl_version')
    ]
]);
?>
