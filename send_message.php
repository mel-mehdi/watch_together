<!-- filepath: /home/melmehdi/watching/send_message.php -->
<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $message = htmlspecialchars($_POST['message']);
    $file = 'messages.txt';

    if (!empty($message)) {
        file_put_contents($file, $message . PHP_EOL, FILE_APPEND);
    }

    header('Location: index.html');
    exit();
}
?>