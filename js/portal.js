function openGradeDrawer(gradeId) {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('grade-drawer');
  const drawerTitle = document.getElementById('drawer-title');

  document.querySelectorAll('.app-list').forEach(list => list.style.display = 'none');

  if (gradeId === 'grade-5') {
    drawerTitle.innerText = "5th Grade Apps";
    document.getElementById('apps-grade-5').style.display = 'block';
  } else if (gradeId === 'grade-12') {
    drawerTitle.innerText = "12th Grade Apps";
    document.getElementById('apps-grade-12').style.display = 'block';
  }

  overlay.style.display = 'block';
  drawer.classList.add('open');
}

function closeGradeDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('grade-drawer');
  
  drawer.classList.remove('open');
  overlay.style.display = 'none';
}