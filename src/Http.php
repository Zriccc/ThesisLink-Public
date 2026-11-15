<?php
declare(strict_types=1);
namespace ThesisLink;

final class HttpError extends \RuntimeException
{
    public function __construct(public int $status, string $message, public array $details = []) { parent::__construct($message); }
}

final class Http
{
    public static function fail(int $status, string $message, array $details = []): never { throw new HttpError($status, $message, $details); }
    public static function json(array $value, int $status = 200): never
    {
        http_response_code($status); header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store'); echo json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); exit;
    }
    public static function redirect(string $path): never { header('Location: ' . $path, true, 303); exit; }
    public static function body(): array
    {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) self::fail(415, 'Request must contain JSON.');
        $raw = file_get_contents('php://input', false, null, 0, 131073);
        if ($raw === false || strlen($raw) > 131072) self::fail(413, 'Request is too large.');
        try { $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { self::fail(400, 'Request must contain valid JSON.'); }
        if (!$object instanceof \stdClass) self::fail(400, 'Request must be an object.');
        return json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    }
    public static function origin(string $url): string
    {
        $u = parse_url($url);
        if (!$u || !isset($u['scheme'], $u['host']) || !in_array($u['scheme'], ['http','https'], true)) self::fail(503, 'Application URL is invalid.');
        return $u['scheme'] . '://' . strtolower($u['host']) . (isset($u['port']) ? ':' . $u['port'] : '');
    }
    public static function sameOrigin(array $config): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' ? !hash_equals(self::origin($config['app_url']), $origin) : ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') !== 'same-origin') self::fail(403, 'Request origin rejected.');
    }
    public static function cookie(string $name, string $value, int $expires, bool $secure): void
    {
        setcookie($name, $value, ['expires'=>$expires,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Lax']);
    }
    public static function iso(?string $date): ?string { return $date ? (new \DateTimeImmutable($date, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z') : null; }
    public static function now(): string { return gmdate('Y-m-d H:i:s'); }
}
