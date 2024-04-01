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
        self.update_entries_list()  # Update the list view with saved data

    def configure_page(self):
        self.page.bgcolor = ft.colors.BROWN
        self.page.window_width = 350
        self.page.window_height = 450  # Increase height to accommodate the list
        self.page.window_resizable = True  # Allow resizing to scroll
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"

    def update_entries_list(self):
        # Fetch data from the database and update the ListView
        self.entries_list.controls.clear()
        self.entries_list.controls = [
            ft.Text(value=f"{entry['start_time']} - {entry['end_time']} - {entry['duration']}s - {entry['description']}")
            for entry in db.all()
        ]
        self.entries_list.update()  # Update the ListView to reflect the new data
        self.page.update()  # Update the page to reflect the new entries

    def stopper(self):
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
        self.description_input.value = ""  # Clear the input
        self.description_input.visible = False  # Hide the input field
        self.main_button.icon = "play_arrow"
        self.main_button.tooltip = "Start Timer"
        self.main_button.bgcolor = ft.colors.GREEN
        self.page.bgcolor = ft.colors.BROWN
        self.update_entries_list()  # Update the entries list after stopping the timer
    
    def starter(self):
        self.running = True
        self.start_time = datetime.now()
        self.end_time = None
        self.description_input.visible = True
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
        self.entries_list = ft.ListView(height=self.page.window_height * .9)  # Initialize the ListView for entries
        self.page.add(self.main_button)
        self.page.add(self.description_input)
        self.page.add(self.entries_list)  # Add the ListView to the page
        self.update_entries_list()

ft.app(target=TimeTree)
