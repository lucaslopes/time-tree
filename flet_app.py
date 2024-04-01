import flet as ft
from datetime import datetime
from tinydb import TinyDB, Query

db = TinyDB('time_tree.json')  # Initialize the database

class TimeTree:
    def __init__(self, page: ft.Page) -> None:
        self.running = False
        self.start_time = None
        self.end_time = None
        self.page = page
        self.configure_page()
        self.main_page()
    
    def configure_page(self):
        self.page.bgcolor = ft.colors.BLACK12
        self.page.window_width = 350
        self.page.window_height = 450
        self.page.window_resizable = False
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"
  
    def toggle_timer(self, event):
        if self.running:
            # Stop the timer and calculate the duration
            self.running = False
            self.end_time = datetime.now()
            duration = self.end_time - self.start_time
            db.insert({'start_time': self.start_time.isoformat(), 'end_time': self.end_time.isoformat(), 'duration': duration.total_seconds()})
            self.page.add(ft.Text(f"End Time: {self.end_time}"))
            self.page.controls[0].icon = "play_arrow"
            self.page.controls[0].tooltip = "Start Timer"
        else:
            # Start the timer
            self.running = True
            self.start_time = datetime.now()
            self.end_time = None
            self.page.add(ft.Text(f"Start Time: {self.start_time}"))
            self.page.controls[0].icon = "stop"
            self.page.controls[0].tooltip = "Stop Timer"
        self.page.update()
  
    def main_page(self):
        button = ft.FloatingActionButton(icon="play_arrow", tooltip="Start Timer", on_click=self.toggle_timer)
        self.page.add(button)  # Add the button to the page

ft.app(target=TimeTree)
