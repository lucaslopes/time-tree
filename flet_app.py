import flet as ft
from datetime import datetime
from tinydb import TinyDB, Query

db = TinyDB('time_tree.json')  # Initialize the database

class TimeTree:
    def __init__(self, page: ft.Page) -> None:
        self.running = False
        self.start_time = None
        self.end_time = None
        self.description = None  # Initialize description attribute
        self.page = page
        self.configure_page()
        self.main_page()
    
    def configure_page(self):
        self.page.bgcolor = ft.colors.BROWN
        self.page.window_width = 350
        self.page.window_height = 450
        self.page.window_resizable = False
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"

    def stopper(self):
        # Stop the timer, save data, and hide the text input
        self.running = False
        self.end_time = datetime.now()
        duration = self.end_time - self.start_time
        self.description = self.description_input.value
        db.insert({
            'start_time': self.start_time.isoformat(), 
            'end_time': self.end_time.isoformat(), 
            'duration': duration.total_seconds(), 
            'description': self.description
        })
        # self.page.add(ft.Text(f"End Time: {self.end_time}"))
        self.description_input.value = ""  # Clear the input
        self.description_input.visible = False  # Hide the input field
        self.main_button.icon = "play_arrow"
        self.main_button.tooltip = "Start Timer"
        self.main_button.bgcolor = ft.colors.GREEN
        self.page.bgcolor = ft.colors.BROWN
    
    def starter(self):
        # Start the timer and show the text input
        self.running = True
        self.start_time = datetime.now()
        self.end_time = None
        self.description_input.visible = True  # Show the text input field
        # self.page.add(ft.Text(f"Start Time: {self.start_time}"))
        self.main_button.icon = "stop"
        self.main_button.tooltip = "Stop Timer"
        self.main_button.bgcolor = ft.colors.BROWN
        self.page.bgcolor = ft.colors.GREEN
    
    def toggle_timer(self, event):
        if self.running:
            self.stopper()
        else:
            self.starter()
        self.page.update()
  
    def main_page(self):
        self.description_input = ft.TextField(hint_text="Enter task description", visible=False)
        self.main_button = ft.FloatingActionButton(icon="play_arrow", tooltip="Start Timer", on_click=self.toggle_timer, bgcolor=ft.colors.GREEN)
        self.page.add(self.main_button)  # Add the button to the page
        self.page.add(self.description_input)
        pass

ft.app(target=TimeTree)
