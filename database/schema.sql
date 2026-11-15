-- Fresh install: import once into an EMPTY selected database. No DROP statements.
-- InnoDB / utf8mb4; verify CHECK enforcement on the actual school server.
-- UUIDs and UTC timestamps are supplied/normalized by PHP/import tooling.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

CREATE TABLE users (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    name VARCHAR(120) NOT NULL,
    role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student',
    password_hash VARCHAR(255) NULL,
    google_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    email_verified_at DATETIME(6) NULL,
    registered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NULL,
    graduated BOOLEAN NOT NULL DEFAULT FALSE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    terms_accepted_at DATETIME(6) NULL,
    gmail VARCHAR(254) NULL,
    program VARCHAR(120) NULL,
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY users_email_unique (email),
    UNIQUE KEY users_google_unique (google_subject),
    KEY users_directory_idx (role, graduated),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
    CHECK (role <> 'student' OR expires_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_extensions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    previous_expiry DATETIME(6) NULL,
    expires_at DATETIME(6) NOT NULL,
    requested_in_person BOOLEAN NOT NULL,
    not_graduated_confirmed BOOLEAN NOT NULL,
    approved_at DATETIME(6) NOT NULL,
    approved_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    approved_by_email VARCHAR(254) NOT NULL,
    KEY extensions_user_idx (user_id, approved_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_sessions (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NOT NULL,
    purpose ENUM('normal', 'password_reset') NOT NULL DEFAULT 'normal',
    UNIQUE KEY sessions_one_per_user (user_id),
    KEY sessions_expiry_idx (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_tokens (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    purpose ENUM('verify_email', 'reset_password', 'invite') NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    KEY tokens_user_idx (user_id, purpose),
    KEY tokens_expiry_idx (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE theses (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submitted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    submitted_by_name VARCHAR(120) NOT NULL,
    title VARCHAR(500) NOT NULL,
    adviser_name VARCHAR(120) NULL,
    course ENUM('BSIT', 'BSCS', 'BSDSA') NOT NULL,
    publication_year SMALLINT NOT NULL,
    abstract MEDIUMTEXT NOT NULL,
    keywords VARCHAR(1000) NOT NULL DEFAULT '',
    status ENUM('pending', 'published', 'declined') NOT NULL DEFAULT 'pending',
    views BIGINT UNSIGNED NOT NULL DEFAULT 0,
    duplicate_title_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    duplicate_authors_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    duplicate_abstract_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reviewed_at DATETIME(6) NULL,
    published_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    KEY theses_status_submitted_idx (status, submitted_at),
    KEY theses_repository_idx (status, course, publication_year),
    KEY theses_adviser_idx (adviser_name),
    KEY theses_title_duplicate_idx (duplicate_title_hash),
    KEY theses_authors_duplicate_idx (duplicate_authors_hash),
    KEY theses_abstract_duplicate_idx (duplicate_abstract_hash),
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (CHAR_LENGTH(TRIM(title)) BETWEEN 1 AND 500),
    CHECK (CHAR_LENGTH(TRIM(submitted_by_name)) BETWEEN 1 AND 120),
    CHECK (adviser_name IS NULL OR CHAR_LENGTH(TRIM(adviser_name)) BETWEEN 1 AND 120),
    CHECK (publication_year BETWEEN 2010 AND 2035),
    CHECK (CHAR_LENGTH(abstract) <= 20000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
    bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    KEY rate_limits_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE oauth_replays (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    expires_at DATETIME NOT NULL,
    KEY oauth_replays_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mail_outbox (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    payload MEDIUMTEXT NOT NULL,
    status ENUM('pending','sent') NOT NULL DEFAULT 'pending',
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    KEY mail_delivery_idx (status,available_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE storage_cleanup (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    bucket VARCHAR(63) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    object_key VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE thesis_duplicate_warnings (
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    warning ENUM('title', 'authors', 'abstract') NOT NULL,
    PRIMARY KEY (thesis_id, warning),
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE thesis_authors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(120) NOT NULL,
    canonical_name_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,
    UNIQUE KEY authors_position_unique (thesis_id, position),
    UNIQUE KEY authors_name_unique (thesis_id, canonical_name_hash),
    KEY authors_name_idx (name),
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
    CHECK (position > 0),
    CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE thesis_files (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    category ENUM('full', 'approval') NOT NULL,
    bucket VARCHAR(63) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'thesislink',
    object_key VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    byte_size BIGINT UNSIGNED NOT NULL,
    etag VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY files_object_unique (object_key),
    UNIQUE KEY files_category_unique (thesis_id, category),
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
    CHECK (byte_size > 0),
    CHECK (CHAR_LENGTH(TRIM(object_key)) > 0),
    CHECK (CHAR_LENGTH(TRIM(original_name)) > 0),
    CHECK (CHAR_LENGTH(TRIM(mime_type)) > 0),
    CHECK (CHAR_LENGTH(TRIM(bucket)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE thesis_reviews (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reviewer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reviewer_name VARCHAR(120) NOT NULL,
    decision ENUM('approved', 'declined') NOT NULL,
    remarks VARCHAR(1000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY reviews_thesis_idx (thesis_id, created_at),
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (CHAR_LENGTH(TRIM(reviewer_name)) BETWEEN 1 AND 120),
    CHECK ((decision = 'approved' AND remarks IS NULL) OR
        (decision = 'declined' AND remarks IS NOT NULL AND CHAR_LENGTH(TRIM(remarks)) BETWEEN 1 AND 1000))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    recipient_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    type ENUM('submission_approved', 'submission_declined') NOT NULL,
    message VARCHAR(1000) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    read_at DATETIME(6) NULL,
    KEY notifications_recipient_idx (recipient_user_id, created_at),
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
    CHECK (CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE thesis_views (
    thesis_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    viewer_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    viewed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (thesis_id, viewer_hash),
    KEY views_date_idx (viewed_at),
    FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_logs (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    action ENUM('submitted', 'uploaded', 'resubmitted', 'approved', 'declined',
        'edited', 'deleted', 'registered', 'extended account',
        'deleted graduated student account', 'created adviser account', 'created faculty account') NOT NULL,
    actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    actor_name VARCHAR(120) NOT NULL,
    subject VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY activity_date_idx (created_at),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (CHAR_LENGTH(TRIM(actor_name)) BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
