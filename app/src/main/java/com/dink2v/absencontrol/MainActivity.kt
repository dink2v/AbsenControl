package com.dink2v.absencontrol

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

private val Navy = Color(0xFF202820)
private val Blue = Color(0xFF54765B)
private val Page = Color(0xFFF7F7F2)
private val Muted = Color(0xFF74796F)
private val ForestSoft = Color(0xFFE9EEE7)
private val ForestLine = Color(0xFFE3E2D9)

class MainActivity : ComponentActivity() {
    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
    private val db: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = Page) {
                    AdminApp(auth = auth, db = db)
                }
            }
        }
    }
}

@Composable
private fun AdminApp(auth: FirebaseAuth, db: FirebaseFirestore) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var isAdmin by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Masuk menggunakan akun administrator.") }
    var selectedTab by remember { mutableStateOf("Beranda") }

    fun verifyAdmin(uid: String) {
        isLoading = true
        db.collection("controlAdmins").document(uid).get()
            .addOnSuccessListener { document ->
                isLoading = false
                val allowed = document.exists() && document.getBoolean("active") == true
                if (allowed) {
                    isAdmin = true
                    status = "Akses administrator terverifikasi."
                } else {
                    auth.signOut()
                    isAdmin = false
                    status = "Akses ditolak. Akun ini tidak terdaftar sebagai admin aktif."
                }
            }
            .addOnFailureListener {
                isLoading = false
                auth.signOut()
                isAdmin = false
                status = "Verifikasi admin gagal. Periksa koneksi internet."
            }
    }

    LaunchedEffect(Unit) {
        auth.currentUser?.uid?.let { verifyAdmin(it) }
    }

    if (isAdmin) {
        DashboardScreen(
            selectedTab = selectedTab,
            onSelectTab = { selectedTab = it },
            onLogout = {
                auth.signOut()
                isAdmin = false
                email = ""
                password = ""
                status = "Kamu sudah keluar."
                selectedTab = "Beranda"
            }
        )
    } else {
        LoginScreen(
            email = email,
            password = password,
            status = status,
            isLoading = isLoading,
            onEmailChange = { email = it },
            onPasswordChange = { password = it },
            onClear = {
                email = ""
                password = ""
                status = "Masukkan email dan password akun administrator."
            },
            onLogin = {
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
            }
        )
    }
}

@Composable
private fun LoginScreen(
    email: String,
    password: String,
    status: String,
    isLoading: Boolean,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onClear: () -> Unit,
    onLogin: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 26.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Navy),
            contentAlignment = Alignment.Center
        ) {
            Text("AC", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(24.dp))
        Text("ABSEN CONTROL", color = Navy, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text("Kelola kehadiran tim dengan lebih mudah.", color = Muted, fontSize = 15.sp)
        Spacer(Modifier.height(32.dp))
        Text("Selamat datang, Admin", color = Navy, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("Masuk dengan akun administrator kamu.", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(22.dp))
        OutlinedTextField(
            value = email,
            onValueChange = onEmailChange,
            label = { Text("Email administrator") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
            shape = RoundedCornerShape(14.dp)
        )
        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
            shape = RoundedCornerShape(14.dp)
        )
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = onLogin,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = !isLoading,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Blue)
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Memeriksa akun...")
            } else {
                Text("Masuk ke Dashboard", fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(status, color = if (status.startsWith("Login gagal") || status.startsWith("Akses ditolak") || status.startsWith("Verifikasi")) Color(0xFFB42318) else Muted, fontSize = 13.sp)
        TextButton(onClick = onClear, enabled = !isLoading) {
            Text("Bersihkan formulir")
        }
        Spacer(Modifier.height(18.dp))
        Text("Akses khusus administrator", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun DashboardScreen(
    selectedTab: String,
    onSelectTab: (String) -> Unit,
    onLogout: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().animateContentSize(animationSpec = tween(180))) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(start = 22.dp, end = 22.dp, top = 26.dp, bottom = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(ForestSoft),
                    contentAlignment = Alignment.Center
                ) {
                    Text("AC", color = Blue, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("ABSEN CONTROL", color = Navy, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Panel administrator", color = Muted, fontSize = 12.sp)
                }
                TextButton(onClick = onLogout) {
                    Text("Keluar", color = Navy)
                }
            }
            Spacer(Modifier.height(26.dp))
            Text("Halo, Admin 👋", color = Navy, fontSize = 25.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(5.dp))
            Text("Pantau kehadiran tim kamu di sini.", color = Muted, fontSize = 14.sp)
        }

        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp).animateContentSize(animationSpec = tween(180))
        ) {
            if (selectedTab == "Beranda") {
                Text("Ringkasan hari ini", color = Navy, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(5.dp))
                Text("Statistik akan terhubung ke data Firebase.", color = Muted, fontSize = 13.sp)
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SummaryCard("Hadir", "—", "✓", Color(0xFFE7F8EF), Color(0xFF16804A), Modifier.weight(1f))
                    SummaryCard("Terlambat", "—", "◷", Color(0xFFFFF3DE), Color(0xFFAC6500), Modifier.weight(1f))
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SummaryCard("Izin", "—", "✉", Color(0xFFEAF1FF), Blue, Modifier.weight(1f))
                    SummaryCard("Tidak hadir", "—", "–", Color(0xFFFFE9E8), Color(0xFFB42318), Modifier.weight(1f))
                }
                Spacer(Modifier.height(24.dp))
                Text("Menu utama", color = Navy, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                MenuTile("👥", "Data Karyawan", "Lihat dan kelola daftar karyawan") { onSelectTab("Karyawan") }
                MenuTile("🕘", "Riwayat Absensi", "Pantau catatan kehadiran") { onSelectTab("Absensi") }
                MenuTile("📄", "Pengajuan", "Tinjau izin dan pengajuan karyawan") { onSelectTab("Pengajuan") }
            } else {
                Text(selectedTab, color = Navy, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Text(
                    when (selectedTab) {
                        "Karyawan" -> "Daftar karyawan akan ditampilkan dari koleksi users."
                        "Absensi" -> "Riwayat kehadiran akan ditampilkan dari koleksi attendance."
                        "Pengajuan" -> "Pengajuan karyawan akan ditampilkan dari koleksi pengajuan."
                        else -> "Pengaturan administrator."
                    },
                    color = Muted,
                    fontSize = 14.sp
                )
                Spacer(Modifier.height(18.dp))
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(Modifier.padding(18.dp)) {
                        Text("Tahap rancangan UI", color = Navy, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Spacer(Modifier.height(8.dp))
                        Text("Tampilan dasar sudah disiapkan. Langkah berikutnya adalah menghubungkan halaman ini ke data Firebase dan menambahkan aksi admin.", color = Muted, fontSize = 14.sp)
                    }
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            listOf("Beranda", "Karyawan", "Absensi", "Pengajuan").forEach { item ->
                Column(
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                        .clickable { onSelectTab(item) }.padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        when (item) {
                            "Beranda" -> "⌂"
                            "Karyawan" -> "♙"
                            "Absensi" -> "◷"
                            else -> "▤"
                        },
                        color = if (selectedTab == item) Blue else Muted,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(item, color = if (selectedTab == item) Blue else Muted, fontSize = 10.sp, fontWeight = if (selectedTab == item) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(
    title: String,
    value: String,
    symbol: String,
    tint: Color,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        modifier = modifier.animateContentSize(animationSpec = tween(160)),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Box(
                modifier = Modifier.size(34.dp).clip(CircleShape).background(tint),
                contentAlignment = Alignment.Center
            ) {
                Text(symbol, color = accent, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
            Spacer(Modifier.height(14.dp))
            Text(value, color = Navy, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
            Text(title, color = Muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun MenuTile(
    symbol: String,
    title: String,
    description: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).animateContentSize(animationSpec = tween(160)).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(ForestSoft),
                contentAlignment = Alignment.Center
            ) {
                Text(symbol, fontSize = 20.sp)
            }
            Spacer(Modifier.width(13.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = Navy, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.height(4.dp))
                Text(description, color = Muted, fontSize = 12.sp)
            }
            Text("›", color = Blue, fontSize = 27.sp)
        }
    }
}
