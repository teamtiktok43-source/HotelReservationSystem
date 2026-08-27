import asyncio
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select

from database import AsyncSessionLocal, Base, engine
from models import User


USERNAME = "Mostafa Aamer"
PASSWORD = "M123456m"
FULL_NAME = "Mostafa Aamer Ahmed"
ROLE = "IT"


async def main():
    print("=== Ensure IT User ===")

    # Make sure the database tables exist before inserting/updating the user.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    password_hash = bcrypt.hashpw(
        PASSWORD.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.username == USERNAME)
        )

        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                username=USERNAME,
                password_hash=password_hash,
                full_name=FULL_NAME,
                role=ROLE,
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )

            session.add(user)

            await session.commit()
            await session.refresh(user)

            print()
            print("IT user created successfully.")
        else:
            user.password_hash = password_hash
            user.full_name = FULL_NAME
            user.role = ROLE
            user.is_active = True

            await session.commit()
            await session.refresh(user)

            print()
            print("IT user already existed and was updated successfully.")

        print()
        print("Username:", user.username)
        print("Full name:", user.full_name)
        print("Role:", user.role)
        print("Active:", user.is_active)
        print("Password: updated")


if __name__ == "__main__":
    asyncio.run(main())
