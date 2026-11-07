package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.wizardchat.core.LoginIdentifier

class SignInIdentifierTest {
    @Test
    fun readsWhatTheBoxCanHold() {
        assertEquals(SignInIdentifier.User("ash"), SignInIdentifier.parse(" ash "))
        assertEquals(SignInIdentifier.User("ash"), SignInIdentifier.parse("@ash"))
        assertEquals(SignInIdentifier.Mxid("@ash:example.org"), SignInIdentifier.parse("@ash:example.org"))
        assertEquals(SignInIdentifier.Email("ash@mail.example"), SignInIdentifier.parse("ash@mail.example"))
        assertEquals(SignInIdentifier.Phone("49151234567"), SignInIdentifier.parse("+49 151 234567"))
        assertNull(SignInIdentifier.parse("  "))
    }

    @Test
    fun aRunOfDigitsIsAUsername() {
        assertEquals(SignInIdentifier.User("1234567"), SignInIdentifier.parse("1234567"))
    }

    @Test
    fun anEmailOnTheServerNameIsAUserId() {
        assertEquals(SignInIdentifier.User("ash"), SignInIdentifier.interpret("ash@example.org", "example.org"))
        assertEquals(SignInIdentifier.Email("ash@mail.example"), SignInIdentifier.interpret("ash@mail.example", "example.org"))
    }

    @Test
    fun becomesTheCoreIdentifier() {
        assertEquals(LoginIdentifier.User("@a:b.org"), SignInIdentifier.Mxid("@a:b.org").toCore())
        assertEquals(LoginIdentifier.Phone("491"), SignInIdentifier.Phone("491").toCore())
        assertEquals(LoginIdentifier.Email("a@b.co"), SignInIdentifier.Email("a@b.co").toCore())
    }
}
