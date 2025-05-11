<!-- filepath: /home/melmehdi/watching/load_messages.php -->
<?php
$file = 'messages.txt';

if (file_exists($file)) {
    $messages = file($file, FILE_IGNORE_NEW_LINES);
    foreach ($messages as $message) {
        echo '<p>' . htmlspecialchars($message) . '</p>';
    }
}
?>