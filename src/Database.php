<?php
declare(strict_types=1);

final class Database
{
    public static function connect(array $config): PDO
    {
        $host = (string) ($config['host'] ?? '127.0.0.1');
        $name = (string) ($config['name'] ?? 'thesislink');
        $port = filter_var($config['port'] ?? 3306, FILTER_VALIDATE_INT);
        if (!preg_match('/\A[a-zA-Z0-9._-]+\z/', $host)
            || !preg_match('/\A[a-zA-Z0-9_]+\z/', $name)
            || $port === false || $port < 1 || $port > 65535) {
            throw new InvalidArgumentException('Invalid database configuration.');
        }

        $pdo = new PDO(
            "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
            (string) ($config['username'] ?? ''),
            (string) ($config['password'] ?? ''),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+00:00'");
        // Shared hosting may disable strict mode globally. Never silently
        // truncate imported identifiers, names, or file metadata.
        $pdo->exec("SET SESSION sql_mode = CONCAT_WS(',', NULLIF(@@SESSION.sql_mode, ''), 'STRICT_TRANS_TABLES')");
        return $pdo;
    }
}
