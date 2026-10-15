package com.dink2v.absencontrol

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class MainActivity : ComponentActivity() {
    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
    private val db: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AdminApp(
                        auth = auth,
                        db = db
                    )
                }
            }
        }
    }
}

@Composable
private fun AdminApp(
    auth: FirebaseAuth,
    db: FirebaseFirestore
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var isAdmin by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Masuk menggunakan akun administrator.") }

    fun verifyAdmin(uid: String) {
        isLoading = true
        db.collection("controlAdmins").document(uid).get()
            .addOnSuccessListener { document ->
                isLoading = false
                val allowed = document.exists() && document.getBoolean("active") != false
                if (allowed) {
                    isAdmin = true
                    status = "Akses administrator terverifikasi."
                } else {
                    auth.signOut()
                    isAdmin = false
                    status = "Akses ditolak. Akun ini tidak terdaftar sebagai admin."
                }
            }
            .addOnFailureListener {
                isLoading = false
                auth.signOut()
                isAdmin = false
                status = "Tidak dapat memverifikasi izin admin. Periksa koneksi dan aturan Firestore."
            }
    }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        auth.currentUser?.uid?.let { verifyAdmin(it) }
    }

    if (isAdmin) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start
        ) {
            Text(
                text = "ABSEN CONTROL",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text("Dashboard administrator", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(12.dp))
            Text("Login berhasil dan dokumen controlAdmins/{uid} ditemukan.")
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = {
                    auth.signOut()
                    isAdmin = false
                    email = ""
                    password = ""
                    status = "Kamu sudah keluar."
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Keluar")
            }
        }
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start
        ) {
            Text(
                text = "ABSEN CONTROL",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text("Login administrator", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(24.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = {
                    val cleanEmail = email.trim()
                    if (cleanEmail.isBlank() || password.isBlank()) {
                        status = "Isi email dan password terlebih dahulu."
                    } else {
                        isLoading = true
                        status = "Sedang masuk..."
                        auth.signInWithEmailAndPassword(cleanEmail, password)
                            .addOnSuccessListener { result ->
                                val uid = result.user?.uid
                                if (uid == null) {
                                    auth.signOut()
                                    isLoading = false
                                    status = "Login gagal. Silakan coba lagi."
                                } else {
                                    verifyAdmin(uid)
                                }
                            }
                            .addOnFailureListener {
                                isLoading = false
                                status = "Login gagal. Periksa email dan password."
                            }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(18.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Masuk")
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(status, style = MaterialTheme.typography.bodyMedium)
            TextButton(
                onClick = {
                    email = ""
                    password = ""
                    status = "Masukkan email dan password akun administrator."
                },
                enabled = !isLoading
            ) {
                Text("Bersihkan")
            }
        }
    }
}
