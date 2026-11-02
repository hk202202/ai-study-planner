"""Promote an existing account to admin. Run from backend/: python make_admin.py someone@example.com"""

import sys

from app.db.models import User, UserRole
from app.db.session import SessionLocal, init_db


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: python make_admin.py <email>")
    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == sys.argv[1].lower()).first()
        if not user:
            sys.exit(f"No account found for {sys.argv[1]}")
        user.role = UserRole.admin.value
        db.commit()
        print(f"{user.email} is now an admin")
    finally:
        db.close()


if __name__ == "__main__":
    main()
