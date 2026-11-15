<?php
declare(strict_types=1);
namespace ThesisLink;

final class Db
{
    public function __construct(public \PDO $pdo) {}
    public function run(string $sql, array $args = []): \PDOStatement { $s=$this->pdo->prepare($sql); $s->execute($args); return $s; }
    public function one(string $sql, array $args = []): ?array { return $this->run($sql,$args)->fetch() ?: null; }
    public function all(string $sql, array $args = []): array { return $this->run($sql,$args)->fetchAll(); }
    public function transaction(callable $work): mixed
    {
        $this->pdo->beginTransaction();
        try { $result=$work(); $this->pdo->commit(); return $result; }
        catch (\Throwable $e) { if($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $e; }
    }
    public static function uuid(): string
    {
        $b=random_bytes(16); $b[6]=chr((ord($b[6])&15)|64); $b[8]=chr((ord($b[8])&63)|128);
        $h=bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);
    }
    public function log(string $action, array $actor, string $subject): void
    {
        $this->run('INSERT INTO activity_logs (id,action,actor_user_id,actor_name,subject) VALUES (?,?,?,?,?)', [self::uuid(),$action,$actor['id'],$actor['name'],mb_substr($subject,0,500)]);
    }
    public function throttle(string $key, int $limit, int $seconds): void
    {
        $this->transaction(function() use($key,$limit,$seconds) {
            $hash=hash('sha256',$key);
            $this->run('INSERT IGNORE INTO rate_limits (bucket_hash,hits,expires_at) VALUES (?,0,?)',[$hash,gmdate('Y-m-d H:i:s',time()+$seconds)]);
            $row=$this->one('SELECT * FROM rate_limits WHERE bucket_hash=? FOR UPDATE',[$hash]);
            if(strtotime($row['expires_at'].' UTC')<=time()) {$row['hits']=0;$row['expires_at']=gmdate('Y-m-d H:i:s',time()+$seconds);}
            if((int)$row['hits'] >= $limit) Http::fail(429,'Too many attempts. Please wait and try again.');
            $this->run('UPDATE rate_limits SET hits=?,expires_at=? WHERE bucket_hash=?',[(int)$row['hits']+1,$row['expires_at'],$hash]);
        });
    }
}
