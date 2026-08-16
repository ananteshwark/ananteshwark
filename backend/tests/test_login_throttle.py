from app.services.login_throttle import LoginThrottle


class TestLoginThrottle:
    def test_locks_after_max_attempts(self):
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        assert t.retry_after("a@x.com", now=0) == 0
        for i in range(3):
            t.record_failure("a@x.com", now=i)
        wait = t.retry_after("a@x.com", now=3)
        assert wait > 0

    def test_not_locked_below_max(self):
        t = LoginThrottle(3, 900)
        t.record_failure("a@x.com", now=0)
        t.record_failure("a@x.com", now=1)
        assert t.retry_after("a@x.com", now=2) == 0

    def test_window_ages_out(self):
        t = LoginThrottle(3, 900)
        for i in range(3):
            t.record_failure("a@x.com", now=i)
        assert t.retry_after("a@x.com", now=5) > 0
        # once the oldest failure ages past the window, the lock releases
        assert t.retry_after("a@x.com", now=901) == 0

    def test_reset_clears(self):
        t = LoginThrottle(3, 900)
        for i in range(3):
            t.record_failure("a@x.com", now=i)
        t.reset("a@x.com")
        assert t.retry_after("a@x.com", now=3) == 0

    def test_keys_independent(self):
        t = LoginThrottle(2, 900)
        t.record_failure("a@x.com", now=0)
        t.record_failure("a@x.com", now=1)
        assert t.retry_after("a@x.com", now=2) > 0
        assert t.retry_after("b@x.com", now=2) == 0
