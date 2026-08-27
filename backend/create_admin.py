import asyncio
import getpass
import bcrypt

from datetime import datetime, timezone
from sqlalchemy import select

from database import AsyncSessionLocal
from models import User


async def main():
    print("=== Create Admin User ===")

    username = input("Username: ").strip()

    if not username:
        print("Username cannot be empty.")
        return

    password = getpass.getpass("Password: ")

    if not password:
        print("Password cannot be empty.")
        return

    full_name = input("Full name: ").strip()

    async with AsyncSessionLocal() as session:

        result = await session.execute(
            select(User).where(
                User.username == username
            )
        )

        existing_user = result.scalar_one_or_none()

        if existing_user:
            print("User already exists.")
            return

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        user = User(
            username=username,
            password_hash=password_hash,
            full_name=full_name or None,
            role="admin",
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )

        session.add(user)

        await session.commit()

        print()
        print("Admin created successfully!")
        print(f"Username: {username}")
        print(f"Full name: {full_name}")


if __name__ == "__main__":
    asyncio.run(main())